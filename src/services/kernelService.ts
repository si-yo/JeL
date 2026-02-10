import { v4 as uuidv4 } from 'uuid';
import type { CellOutput } from '../types';

/**
 * Jupyter Kernel Service
 * Communicates with Jupyter server via REST API + WebSocket
 */

type MessageHandler = (msg: JupyterMessage) => void;

interface JupyterMessage {
  header: {
    msg_id: string;
    msg_type: string;
    session: string;
    username: string;
    version: string;
  };
  parent_header: {
    msg_id?: string;
    [key: string]: unknown;
  };
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
  channel: string;
}

export class KernelService {
  private baseUrl: string;
  private wsBaseUrl: string;
  private token: string;
  private kernelId: string | null = null;
  private ws: WebSocket | null = null;
  private session: string;
  private pendingExecutions: Map<string, {
    onOutput: (output: CellOutput) => void;
    onDone: (executionCount: number | null) => void;
    onStatus: (status: string) => void;
  }> = new Map();
  private statusCallback: ((state: string) => void) | null = null;

  constructor(port: number, token: string) {
    this.baseUrl = `http://localhost:${port}`;
    this.wsBaseUrl = `ws://localhost:${port}`;
    this.token = token;
    this.session = uuidv4();
  }

  private headers() {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `token ${this.token}`;
    return h;
  }

  onStatus(callback: (state: string) => void) {
    this.statusCallback = callback;
  }

  async startKernel(name = 'python3'): Promise<string> {
    const resp = await fetch(`${this.baseUrl}/api/kernels`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ name }),
    });

    if (!resp.ok) throw new Error(`Failed to start kernel: ${resp.statusText}`);

    const data = await resp.json();
    this.kernelId = data.id;

    await this.connectWebSocket();
    return data.id;
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.kernelId) throw new Error('No kernel');

    const tokenParam = this.token ? `?token=${this.token}` : '';
    const url = `${this.wsBaseUrl}/api/kernels/${this.kernelId}/channels${tokenParam}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.statusCallback?.('idle');
        resolve();
      };

      this.ws.onerror = (e) => {
        console.error('[KernelWS] Error:', e);
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        this.statusCallback?.('disconnected');
        this.ws = null;
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: JupyterMessage = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error('[KernelWS] Parse error:', e);
        }
      };
    });
  }

  private handleMessage(msg: JupyterMessage) {
    const parentMsgId = msg.parent_header?.msg_id as string;
    const handler = parentMsgId ? this.pendingExecutions.get(parentMsgId) : undefined;

    switch (msg.header.msg_type) {
      case 'status': {
        const state = msg.content.execution_state as string;
        this.statusCallback?.(state);
        handler?.onStatus(state);
        break;
      }

      case 'execute_result': {
        if (handler) {
          handler.onOutput({
            output_type: 'execute_result',
            data: msg.content.data as Record<string, string | string[]>,
            metadata: msg.content.metadata as Record<string, unknown>,
            execution_count: msg.content.execution_count as number,
          });
        }
        break;
      }

      case 'stream': {
        if (handler) {
          handler.onOutput({
            output_type: 'stream',
            name: msg.content.name as 'stdout' | 'stderr',
            text: msg.content.text as string,
          });
        }
        break;
      }

      case 'display_data': {
        if (handler) {
          handler.onOutput({
            output_type: 'display_data',
            data: msg.content.data as Record<string, string | string[]>,
            metadata: msg.content.metadata as Record<string, unknown>,
          });
        }
        break;
      }

      case 'error': {
        if (handler) {
          handler.onOutput({
            output_type: 'error',
            ename: msg.content.ename as string,
            evalue: msg.content.evalue as string,
            traceback: msg.content.traceback as string[],
          });
        }
        break;
      }

      case 'execute_reply': {
        if (handler) {
          const execCount = msg.content.execution_count as number | null;
          handler.onDone(execCount);
          this.pendingExecutions.delete(parentMsgId);
        }
        break;
      }
    }
  }

  executeCode(
    code: string,
    onOutput: (output: CellOutput) => void,
    onDone: (executionCount: number | null) => void,
    onStatus: (status: string) => void
  ): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const msgId = uuidv4();

    this.pendingExecutions.set(msgId, { onOutput, onDone, onStatus });

    const msg = {
      header: {
        msg_id: msgId,
        msg_type: 'execute_request',
        session: this.session,
        username: 'lab',
        version: '5.3',
      },
      parent_header: {},
      metadata: {},
      content: {
        code,
        silent: false,
        store_history: true,
        user_expressions: {},
        allow_stdin: false,
        stop_on_error: true,
      },
      channel: 'shell',
    };

    this.ws.send(JSON.stringify(msg));
    return msgId;
  }

  async interruptKernel(): Promise<void> {
    if (!this.kernelId) return;
    await fetch(`${this.baseUrl}/api/kernels/${this.kernelId}/interrupt`, {
      method: 'POST',
      headers: this.headers(),
    });
  }

  async restartKernel(): Promise<void> {
    if (!this.kernelId) return;

    this.ws?.close();
    this.pendingExecutions.clear();

    await fetch(`${this.baseUrl}/api/kernels/${this.kernelId}/restart`, {
      method: 'POST',
      headers: this.headers(),
    });

    await this.connectWebSocket();
  }

  async shutdownKernel(): Promise<void> {
    if (!this.kernelId) return;

    this.ws?.close();
    this.pendingExecutions.clear();

    await fetch(`${this.baseUrl}/api/kernels/${this.kernelId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });

    this.kernelId = null;
  }

  getKernelId() {
    return this.kernelId;
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect() {
    this.ws?.close();
    this.pendingExecutions.clear();
    this.kernelId = null;
  }
}
