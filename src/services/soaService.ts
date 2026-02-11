/**
 * SOA Service — Service-Oriented Architecture via IPFS Pubsub
 *
 * Singleton module managing SOA lifecycle:
 * - Register/discover services via `soa:discovery` topic
 * - Per-service communication via `soa:svc:{name}` topics
 * - Request/response pattern with retries (like codeShareService)
 * - Kernel dispatch: execute endpoint functions in Jupyter kernel
 *
 * Convention notebook SOA :
 *   SOA_NAME = "data-service"
 *   SOA_VERSION = "1.0"
 *   def get_data(params):
 *       """GET /data"""
 *       return {"items": [1, 2, 3]}
 */

import type { SoaEndpoint, SoaServiceInfo, SoaMessage, Cell } from '../types';
import { useStore } from '../store/useStore';
import { KernelService } from './kernelService';
import { parseNotebook } from '../utils/notebook';

const DISCOVERY_TOPIC = 'soa:discovery';
const SVC_TOPIC_PREFIX = 'soa:svc:';

// ── Singleton state ────────────────────────────────────

let soaInstance: SoaServiceInstance | null = null;

// ── Core class ─────────────────────────────────────────

class SoaServiceInstance {
  private peerId: string;
  private peerName: string;
  private pubsubCleanup: (() => void) | null = null;
  private subscribedTopics = new Set<string>();
  private serviceKernels = new Map<string, KernelService>();
  private serviceEndpoints = new Map<string, SoaEndpoint[]>();
  private pendingRequests = new Map<string, {
    resolve: (result: unknown) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(peerId: string, peerName: string) {
    this.peerId = peerId;
    this.peerName = peerName;
  }

  // ── Lifecycle ──────────────────────────────────────

  async init(): Promise<void> {
    // Subscribe to discovery topic
    await window.labAPI.ipfs.pubsubSubscribe({ topic: DISCOVERY_TOPIC });
    this.subscribedTopics.add(DISCOVERY_TOPIC);

    // Register pubsub listener for SOA messages (filters by soa: prefix)
    this.pubsubCleanup = window.labAPI.ipfs.onPubsubMessage((msg) => {
      if (!msg.topic?.startsWith('soa:')) return;
      this.handlePubsubMessage(msg.topic, msg.data);
    });

    // Discovery ping every 15s
    this.pingInterval = setInterval(() => {
      this.sendDiscoveryPing().catch(console.error);
    }, 15000);

    // Initial ping
    await this.sendDiscoveryPing();

    useStore.getState().setSoaEnabled(true);
    console.log(`[SOA] Initialized — peerId="${this.peerId.slice(0, 16)}..."`);
  }

  async destroy(): Promise<void> {
    // Stop all running services
    const running = [...useStore.getState().soaRunningServices];
    for (const svc of running) {
      await this.stopService(svc.name).catch(console.error);
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    for (const topic of this.subscribedTopics) {
      await window.labAPI.ipfs.pubsubUnsubscribe({ topic }).catch(() => {});
    }
    this.subscribedTopics.clear();

    this.pubsubCleanup?.();
    this.pubsubCleanup = null;

    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('SOA service arrete'));
    }
    this.pendingRequests.clear();

    useStore.getState().clearSoaServices();
    console.log(`[SOA] Destroyed`);
  }

  // ── Endpoint parsing ───────────────────────────────

  /**
   * Parse SOA_NAME, SOA_VERSION and endpoint functions from notebook cells.
   * Convention: functions with docstring """METHOD /path""" are endpoints.
   */
  parseEndpoints(cells: Cell[]): { name: string; version: string; endpoints: SoaEndpoint[] } {
    let name = '';
    let version = '1.0';
    const endpoints: SoaEndpoint[] = [];

    for (const cell of cells) {
      if (cell.cell_type !== 'code') continue;
      const src = cell.source;

      const nameMatch = src.match(/SOA_NAME\s*=\s*['"]([^'"]+)['"]/);
      if (nameMatch) name = nameMatch[1];

      const versionMatch = src.match(/SOA_VERSION\s*=\s*['"]([^'"]+)['"]/);
      if (versionMatch) version = versionMatch[1];

      // Match: def func_name(params):\n    """GET /path"""
      const funcRegex = /def\s+(\w+)\s*\([^)]*\):\s*\n\s*(?:"""|''')(GET|POST|PUT|DELETE)\s+(\/\S+)(?:"""|''')/g;
      let m;
      while ((m = funcRegex.exec(src)) !== null) {
        endpoints.push({ name: m[1], method: m[2], path: m[3] });
      }
    }

    return { name, version, endpoints };
  }

  // ── Service lifecycle ──────────────────────────────

  /**
   * Start a service from a notebook file.
   * Loads the notebook, parses endpoints, starts a dedicated kernel,
   * executes all cells, subscribes to the service topic, and registers.
   */
  async startService(notebookPath: string): Promise<SoaServiceInfo> {
    const fileResult = await window.labAPI.fs.readFile(notebookPath);
    if (!fileResult.success || !fileResult.data) {
      throw new Error(`Impossible de lire le notebook: ${notebookPath}`);
    }

    const nbData = parseNotebook(fileResult.data);
    const { name, version, endpoints } = this.parseEndpoints(nbData.cells);

    if (!name) throw new Error(`SOA_NAME non trouve dans ${notebookPath}`);
    if (endpoints.length === 0) throw new Error(`Aucun endpoint trouve dans ${notebookPath}`);

    // Stop existing service with same name if running
    if (this.serviceKernels.has(name)) {
      console.log(`[SOA] Service "${name}" deja en cours, redemarrage...`);
      await this.stopService(name);
    }

    console.log(`[SOA] Demarrage service "${name}" v${version} — ${endpoints.length} endpoint(s)`);

    // Start a dedicated kernel for this service
    const { jupyterPort, jupyterToken } = useStore.getState();
    const ks = new KernelService(jupyterPort, jupyterToken);
    await ks.startKernel();
    this.serviceKernels.set(name, ks);
    this.serviceEndpoints.set(name, endpoints);

    // Execute all code cells to set up functions and state
    const codeCells = nbData.cells.filter(c => c.cell_type === 'code' && c.source.trim());
    for (const cell of codeCells) {
      await this.executeInKernel(ks, cell.source);
    }

    // Subscribe to service-specific topic
    const svcTopic = `${SVC_TOPIC_PREFIX}${name}`;
    if (!this.subscribedTopics.has(svcTopic)) {
      await window.labAPI.ipfs.pubsubSubscribe({ topic: svcTopic });
      this.subscribedTopics.add(svcTopic);
    }

    const serviceInfo: SoaServiceInfo = {
      name,
      version,
      peerId: this.peerId,
      peerName: this.peerName,
      notebookPath,
      endpoints,
      status: 'running',
      lastSeen: Date.now(),
    };

    useStore.getState().addSoaRunningService(serviceInfo);

    // Announce on discovery topic
    await this.publishSoaMessage(DISCOVERY_TOPIC, {
      type: 'soa-register',
      from: this.peerId,
      serviceName: name,
      data: { name, version, endpoints, peerId: this.peerId, peerName: this.peerName, notebookPath },
      timestamp: Date.now(),
    });

    console.log(`[SOA] Service "${name}" demarre — endpoints: ${endpoints.map(e => `${e.method} ${e.path}`).join(', ')}`);
    return serviceInfo;
  }

  async stopService(serviceName: string): Promise<void> {
    console.log(`[SOA] Arret service "${serviceName}"`);

    const ks = this.serviceKernels.get(serviceName);
    if (ks) {
      await ks.shutdownKernel().catch(() => {});
      this.serviceKernels.delete(serviceName);
    }
    this.serviceEndpoints.delete(serviceName);

    const svcTopic = `${SVC_TOPIC_PREFIX}${serviceName}`;
    if (this.subscribedTopics.has(svcTopic)) {
      await window.labAPI.ipfs.pubsubUnsubscribe({ topic: svcTopic }).catch(() => {});
      this.subscribedTopics.delete(svcTopic);
    }

    // Announce unregister
    await this.publishSoaMessage(DISCOVERY_TOPIC, {
      type: 'soa-unregister',
      from: this.peerId,
      serviceName,
      data: { name: serviceName, peerId: this.peerId },
      timestamp: Date.now(),
    });

    useStore.getState().removeSoaRunningService(serviceName);
  }

  // ── Client: call a service ─────────────────────────

  /**
   * Call a service endpoint. If the service runs locally, dispatches directly
   * to the kernel. Otherwise, publishes a request on pubsub and waits
   * for a response (3 attempts, 8s timeout each — same as codeShareService).
   */
  async callService(serviceName: string, path: string, params: unknown = {}): Promise<unknown> {
    // Local dispatch (no pubsub round-trip)
    if (this.serviceKernels.has(serviceName)) {
      return this.dispatchToKernel(serviceName, path, params);
    }

    // Remote call via pubsub
    const maxAttempts = 3;
    const timeoutMs = 8000;

    // Subscribe to service topic to receive responses
    const svcTopic = `${SVC_TOPIC_PREFIX}${serviceName}`;
    if (!this.subscribedTopics.has(svcTopic)) {
      await window.labAPI.ipfs.pubsubSubscribe({ topic: svcTopic });
      this.subscribedTopics.add(svcTopic);
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      console.log(`[SOA] >> call "${serviceName}${path}" (attempt ${attempt}/${maxAttempts}) reqId=${requestId}`);

      await this.publishSoaMessage(svcTopic, {
        type: 'soa-request',
        from: this.peerId,
        serviceName,
        data: { requestId, method: 'POST', path, params },
        timestamp: Date.now(),
      });

      try {
        return await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            reject(new Error('timeout'));
          }, timeoutMs);
          this.pendingRequests.set(requestId, { resolve, reject, timeout });
        });
      } catch {
        if (attempt === maxAttempts) {
          throw new Error(`SOA: pas de reponse de '${serviceName}' apres ${maxAttempts} tentatives`);
        }
        console.log(`[SOA] !! Attempt ${attempt} timed out, retrying...`);
      }
    }
    throw new Error('unreachable');
  }

  // ── Kernel dispatch ────────────────────────────────

  /**
   * Execute an endpoint function in the service's kernel.
   * Wraps params as JSON, calls the function, captures stdout JSON result.
   */
  private async dispatchToKernel(serviceName: string, path: string, params: unknown): Promise<unknown> {
    const ks = this.serviceKernels.get(serviceName);
    if (!ks) throw new Error(`Pas de kernel pour le service "${serviceName}"`);

    const endpoints = this.serviceEndpoints.get(serviceName) || [];
    const endpoint = endpoints.find(ep => ep.path === path);
    if (!endpoint) throw new Error(`Endpoint "${path}" introuvable dans "${serviceName}"`);

    const paramsJson = JSON.stringify(params).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const code = [
      `import json as __soa_json`,
      `__soa_params = __soa_json.loads('${paramsJson}')`,
      `__soa_result = ${endpoint.name}(__soa_params)`,
      `print(__soa_json.dumps({"__soa_result": __soa_result}))`,
    ].join('\n');

    const output = await this.executeInKernel(ks, code);

    try {
      const parsed = JSON.parse(output);
      return parsed.__soa_result;
    } catch {
      return output;
    }
  }

  /**
   * Execute code in a kernel and return collected stdout as string.
   */
  private executeInKernel(ks: KernelService, code: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let error: string | null = null;

      ks.executeCode(
        code,
        (output) => {
          if (output.output_type === 'stream' && output.name === 'stdout') {
            stdout += (typeof output.text === 'string' ? output.text : (output.text || []).join(''));
          }
          if (output.output_type === 'error') {
            error = `${output.ename}: ${output.evalue}`;
          }
        },
        () => {
          if (error) reject(new Error(error));
          else resolve(stdout.trim());
        },
        () => {},
      );
    });
  }

  // ── Queries ────────────────────────────────────────

  listServices(): SoaServiceInfo[] {
    const { soaRunningServices, soaAvailableServices } = useStore.getState();
    return [...soaRunningServices, ...soaAvailableServices];
  }

  // ── Incoming message router ────────────────────────

  private handlePubsubMessage(topic: string, data: string): void {
    let msg: SoaMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      console.warn(`[SOA] Impossible de parser le message sur "${topic}"`);
      return;
    }

    // Ignore our own messages
    if (msg.from === this.peerId) return;

    console.log(`[SOA] << ${msg.type} from="${msg.from.slice(0, 16)}..." svc="${msg.serviceName}"`);

    switch (msg.type) {
      case 'soa-register':
        this.handleRegister(msg);
        break;
      case 'soa-unregister':
        this.handleUnregister(msg);
        break;
      case 'soa-request':
        this.handleRequest(msg);
        break;
      case 'soa-response':
        this.handleResponse(msg);
        break;
      case 'soa-ping':
        this.handleSoaPing(msg);
        break;
      case 'soa-pong':
        this.handleSoaPong(msg);
        break;
    }
  }

  private handleRegister(msg: SoaMessage): void {
    const { name, version, endpoints, peerId, peerName, notebookPath } = msg.data as {
      name: string; version: string; endpoints: SoaEndpoint[];
      peerId: string; peerName: string; notebookPath: string;
    };

    useStore.getState().updateSoaAvailableService({
      name, version, peerId, peerName, notebookPath, endpoints,
      status: 'running', lastSeen: Date.now(),
    });
    console.log(`[SOA] Service distant enregistre: "${name}" v${version} de "${peerName}" (${endpoints.length} endpoints)`);
  }

  private handleUnregister(msg: SoaMessage): void {
    const { name, peerId } = msg.data as { name: string; peerId: string };
    useStore.getState().removeSoaAvailableService(name, peerId);
    console.log(`[SOA] Service distant retire: "${name}" de "${peerId.slice(0, 16)}..."`);
  }

  private async handleRequest(msg: SoaMessage): Promise<void> {
    const { requestId, path, params } = msg.data as {
      requestId: string; method: string; path: string; params: unknown;
    };

    // Only respond if we host this service
    if (!this.serviceKernels.has(msg.serviceName)) return;

    console.log(`[SOA] >> Dispatch requete ${requestId} → kernel "${msg.serviceName}${path}"`);

    let result: unknown;
    let error: string | undefined;

    try {
      result = await this.dispatchToKernel(msg.serviceName, path, params);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const svcTopic = `${SVC_TOPIC_PREFIX}${msg.serviceName}`;
    await this.publishSoaMessage(svcTopic, {
      type: 'soa-response',
      from: this.peerId,
      serviceName: msg.serviceName,
      data: { requestId, result, error },
      timestamp: Date.now(),
    });
  }

  private handleResponse(msg: SoaMessage): void {
    const { requestId, result, error } = msg.data as {
      requestId: string; result?: unknown; error?: string;
    };

    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }

  private handleSoaPing(msg: SoaMessage): void {
    const { peerName } = msg.data as { peerId: string; peerName?: string; services?: string[] };
    console.log(`[SOA] << ping de "${peerName || msg.from.slice(0, 16)}..."`);

    // Respond with pong + our running services
    const ourServices = useStore.getState().soaRunningServices;
    this.publishSoaMessage(DISCOVERY_TOPIC, {
      type: 'soa-pong',
      from: this.peerId,
      serviceName: '',
      data: {
        peerId: this.peerId,
        peerName: this.peerName,
        services: ourServices.map(s => s.name),
      },
      timestamp: Date.now(),
    }).catch(console.error);

    // Re-publish registrations so the pinging peer discovers our services
    for (const svc of ourServices) {
      this.publishSoaMessage(DISCOVERY_TOPIC, {
        type: 'soa-register',
        from: this.peerId,
        serviceName: svc.name,
        data: {
          name: svc.name, version: svc.version, endpoints: svc.endpoints,
          peerId: this.peerId, peerName: this.peerName, notebookPath: svc.notebookPath,
        },
        timestamp: Date.now(),
      }).catch(console.error);
    }
  }

  private handleSoaPong(msg: SoaMessage): void {
    const { peerName, services } = msg.data as { peerId: string; peerName: string; services?: string[] };
    console.log(`[SOA] << pong de "${peerName}" services=[${services?.join(',') || ''}]`);
  }

  // ── Discovery ping ─────────────────────────────────

  private async sendDiscoveryPing(): Promise<void> {
    const ourServices = useStore.getState().soaRunningServices.map(s => s.name);
    await this.publishSoaMessage(DISCOVERY_TOPIC, {
      type: 'soa-ping',
      from: this.peerId,
      serviceName: '',
      data: { peerId: this.peerId, peerName: this.peerName, services: ourServices },
      timestamp: Date.now(),
    });
  }

  // ── Publish helper ─────────────────────────────────

  private async publishSoaMessage(topic: string, msg: SoaMessage): Promise<void> {
    await window.labAPI.ipfs.pubsubPublish({ topic, data: JSON.stringify(msg) });
  }
}

// ── Public API (singleton) ─────────────────────────────

export async function initSoa(): Promise<void> {
  if (soaInstance) await destroySoa();

  // Resolve our peer ID from IPFS
  let peerId: string;
  try {
    const info = await window.labAPI.ipfs.getNodeInfo();
    peerId = info.success && info.peerId ? info.peerId : `soa-${Date.now()}`;
  } catch {
    peerId = `soa-${Date.now()}`;
  }

  const { collabPseudo, currentProject } = useStore.getState();
  const peerName = collabPseudo || currentProject?.name || '';

  soaInstance = new SoaServiceInstance(peerId, peerName);
  await soaInstance.init();
}

export async function destroySoa(): Promise<void> {
  if (!soaInstance) return;
  await soaInstance.destroy();
  soaInstance = null;
}

export function getSoaService(): SoaServiceInstance | null {
  return soaInstance;
}
