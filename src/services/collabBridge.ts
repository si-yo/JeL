/**
 * Collab Bridge — orchestration layer for real-time collaboration
 * Singleton module (not a React hook) connecting the store to IPFS pubsub.
 *
 * Protocol a 3 couches :
 *   Couche 1 (Discovery) : ping/pong sur room topic pour decouverte rapide des peers
 *   Couche 2 (Manifest)  : share-manifest reactif sur room topic (broadcast a chaque changement)
 *   Couche 3 (Document)  : cell edits, curseurs, historique sur notebook topics
 *
 * Topic architecture:
 *   Room topic  → ping, pong, presence, share-manifest, code-request, code-response
 *   Notebook topics → cell-update, cell-add, cell-delete, cursor, history-push, notebook-state
 */
import { CollabService } from './collabService';
import { useStore } from '../store/useStore';
import { setRemoteUpdate, isRemoteUpdate } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { restoreSnapshot } from './historyCapture';
import type { CollabMessage, Cell, OpenNotebook } from '../types';
import type { CellSnapshot, HistoryAction } from './historyTypes';
import { v4 as uuidv4 } from 'uuid';

const ROOM_ID = 'collab';

let collabInstance: CollabService | null = null;
let ownPeerId: string | null = null;
let storeUnsub: (() => void) | null = null;
let presenceInterval: ReturnType<typeof setInterval> | null = null;
let swarmPollInterval: ReturnType<typeof setInterval> | null = null;
let manifestWatchUnsub: (() => void) | null = null;
let lastManifestHash: string = '';
let knownSwarmPeers = new Set<string>();
let pingedPeers = new Set<string>();
let discoveryRetryTimers: ReturnType<typeof setTimeout>[] = [];
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Expose current remote peer info for history capture tagging
let _currentRemotePeer: { peerId: string; peerName?: string } | null = null;
export function getCurrentRemotePeer() { return _currentRemotePeer; }
export function getOwnPeerId() { return ownPeerId; }

// ── Lifecycle ─────────────────────────────────────────

/**
 * Initialize collab — called when IPFS is running.
 * Does NOT require a project to be open (discovery/manifests work without one).
 */
export async function initCollab(): Promise<void> {
  console.log(`[Collab:Bridge] initCollab() called — existing instance: ${!!collabInstance}`);

  if (collabInstance) {
    console.log(`[Collab:Bridge] Destroying existing collab instance first`);
    await destroyCollab();
  }

  // Resolve our own peer ID (retry up to 3 times — daemon may still be starting)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const info = await window.labAPI.ipfs.getNodeInfo();
      console.log(`[Collab:Bridge] getNodeInfo attempt ${attempt + 1}:`, info);
      if (info.success && info.peerId) {
        ownPeerId = info.peerId;
        break;
      }
    } catch (e) {
      console.warn(`[Collab:Bridge] getNodeInfo attempt ${attempt + 1} failed:`, e);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ownPeerId) {
    ownPeerId = uuidv4();
    console.warn(`[Collab:Bridge] All getNodeInfo attempts failed, using UUID: ${ownPeerId}`);
  }

  console.log(`[Collab:Bridge] Our peerId: "${ownPeerId?.slice(0, 20)}..."`);
  collabInstance = new CollabService(ROOM_ID, ownPeerId);

  // Register message handler
  collabInstance.onMessage(handleIncomingMessage);
  console.log(`[Collab:Bridge] Message handler registered`);

  // Join shared room topic
  console.log(`[Collab:Bridge] Joining room topic...`);
  await collabInstance.joinProject();
  useStore.getState().setCollabEnabled(true);
  console.log(`[Collab:Bridge] Joined room — collabEnabled=true`);

  // Layer 0: Auto-connect to saved peers (LAN/WAN reconnection)
  await connectToSavedPeers();

  // Layer 1: Initial discovery ping + manifest
  console.log(`[Collab:Bridge] Sending initial ping...`);
  lastManifestHash = ''; // Force manifest publish
  await sendPing();
  await publishManifestIfChanged();

  // Subscribe to notebook topics for already-shared notebooks
  const { sharedNotebooks } = useStore.getState();
  console.log(`[Collab:Bridge] Shared notebooks at init: [${sharedNotebooks.join(', ')}]`);
  for (const path of sharedNotebooks) {
    const rel = toRelativePath(path);
    console.log(`[Collab:Bridge] Subscribing to notebook topic: "${rel}"`);
    await collabInstance.subscribeNotebook(rel);
  }

  // Watch for share-toggle changes + reactive presence broadcast
  storeUnsub = useStore.subscribe((state, prev) => {
    if (!collabInstance) return;

    // New shares → subscribe to notebook topic
    for (const p of state.sharedNotebooks) {
      if (!prev.sharedNotebooks.includes(p)) {
        const rel = toRelativePath(p);
        console.log(`[Collab:Bridge] Share toggled ON: "${p}" → subscribing topic "${rel}"`);
        collabInstance.subscribeNotebook(rel).catch(console.error);
      }
    }
    // Removed shares → unsubscribe
    for (const p of prev.sharedNotebooks) {
      if (!state.sharedNotebooks.includes(p)) {
        const rel = toRelativePath(p);
        console.log(`[Collab:Bridge] Share toggled OFF: "${p}" → unsubscribing topic "${rel}"`);
        collabInstance.unsubscribeNotebook(rel).catch(console.error);
      }
    }

    // Reactive presence broadcast on pseudo or active notebook change
    if (
      state.collabPseudo !== prev.collabPseudo ||
      state.activeNotebookId !== prev.activeNotebookId
    ) {
      broadcastPresence().catch(console.error);
    }
  });

  // Layer 2: Watch for manifest changes (pseudo, shared notebooks)
  manifestWatchUnsub = watchManifestChanges();

  // Wire reciprocal manifest broadcast on receiving a peer's manifest
  collabInstance.codeShare.onManifestReceived(() => {
    publishManifestIfChanged().catch(console.error);
  });

  // Keepalive ping every 10s — ensures mesh stays alive and peers are discovered
  presenceInterval = setInterval(() => {
    sendPing().catch(console.error);
  }, 10000);

  // Background swarm polling every 5s — sends ping on new peer detection
  knownSwarmPeers.clear();
  pingedPeers.clear();
  await pollSwarmPeers(); // Initial poll
  swarmPollInterval = setInterval(() => {
    pollSwarmPeers().catch(console.error);
  }, 5000);

  console.log(`[Collab:Bridge] initCollab() complete — keepalive ping every 10s, swarm polling every 5s`);
}

export function getCollab(): CollabService | null {
  return collabInstance;
}

export async function destroyCollab(): Promise<void> {
  console.log(`[Collab:Bridge] destroyCollab() called`);

  // Send leaving presence before disconnecting
  if (collabInstance) {
    await broadcastPresence('leaving').catch(() => {});
  }

  storeUnsub?.();
  storeUnsub = null;
  manifestWatchUnsub?.();
  manifestWatchUnsub = null;
  if (presenceInterval) {
    clearInterval(presenceInterval);
    presenceInterval = null;
  }
  if (swarmPollInterval) {
    clearInterval(swarmPollInterval);
    swarmPollInterval = null;
  }
  knownSwarmPeers.clear();
  pingedPeers.clear();
  discoveryRetryTimers.forEach(clearTimeout);
  discoveryRetryTimers = [];
  if (collabInstance) {
    await collabInstance.leaveProject();
    collabInstance = null;
  }
  debounceTimers.forEach(clearTimeout);
  debounceTimers.clear();
  ownPeerId = null;
  lastManifestHash = '';
  useStore.getState().setCollabEnabled(false);
  console.log(`[Collab:Bridge] destroyCollab() complete`);
}

// ── Path helpers ─────────────────────────────────────

/** Convert an absolute or mixed path to a relative/filename-only path. */
function toRelativePath(p: string): string {
  const project = useStore.getState().currentProject;
  if (project && p.startsWith(project.path + '/')) {
    return p.replace(project.path + '/', '');
  }
  return p.includes('/') ? p.split('/').pop()! : p;
}

// ── Presence ──────────────────────────────────────────

function computeManifestHash(): string {
  const { sharedNotebooks, collabPseudo } = useStore.getState();
  return `${collabPseudo}|${sharedNotebooks.sort().join(',')}`;
}

/**
 * Broadcast presence to room topic (backward compat + activeNotebook info).
 * Manifest publishing is handled separately by publishManifestIfChanged().
 */
export async function broadcastPresence(status: 'online' | 'leaving' = 'online'): Promise<void> {
  if (!collabInstance) return;

  const { collabPseudo, activeNotebookId, notebooks, sharedNotebooks } = useStore.getState();

  let activeNotebook: string | null = null;
  if (activeNotebookId) {
    const nb = notebooks.find((n) => n.id === activeNotebookId);
    if (nb) {
      activeNotebook = toRelativePath(nb.filePath || nb.fileName);
    }
  }

  const sharedPaths = sharedNotebooks.map(toRelativePath);

  await collabInstance.publishPresence({
    peerName: collabPseudo || '',
    activeNotebook,
    sharedNotebooks: sharedPaths,
    status,
  });
}

// ── Layer 1: Ping/Pong Discovery ─────────────────────

/** Send a ping to room topic — announces our basic identity */
async function sendPing(): Promise<void> {
  if (!collabInstance || !ownPeerId) return;
  const { collabPseudo } = useStore.getState();
  console.log(`[Collab:Bridge] >> ping peerName="${collabPseudo || ''}"`);
  await collabInstance.publishPing({
    peerId: ownPeerId,
    peerName: collabPseudo || '',
    protocolVersion: 1,
  });
}

/** Send a pong (response to a ping) */
async function sendPong(): Promise<void> {
  if (!collabInstance || !ownPeerId) return;
  const { collabPseudo } = useStore.getState();
  console.log(`[Collab:Bridge] >> pong peerName="${collabPseudo || ''}"`);
  await collabInstance.publishPong({
    peerId: ownPeerId,
    peerName: collabPseudo || '',
    protocolVersion: 1,
  });
}

// ── Layer 2: Manifest Reactif ────────────────────────

/** Publish our share-manifest only if it changed since last broadcast */
async function publishManifestIfChanged(): Promise<void> {
  if (!collabInstance) return;
  const currentHash = computeManifestHash();
  if (currentHash !== lastManifestHash) {
    console.log(`[Collab:Bridge] Manifest changed — publishing`);
    await collabInstance.codeShare.publishManifest();
    lastManifestHash = currentHash;
  }
}

/** Watch store for manifest-affecting changes (pseudo, shared notebooks) */
function watchManifestChanges(): () => void {
  return useStore.subscribe((state, prev) => {
    if (!collabInstance) return;
    if (
      state.collabPseudo !== prev.collabPseudo ||
      state.sharedNotebooks !== prev.sharedNotebooks
    ) {
      publishManifestIfChanged().catch(console.error);
    }
  });
}

// ── Background swarm polling ──────────────────────────

/** Parse multiaddr → peerId (last /p2p/ segment) */
function parsePeerIdFromAddr(multiaddr: string): string | null {
  const m = multiaddr.match(/\/p2p\/(\w+)$/);
  return m ? m[1] : null;
}

/**
 * Try to connect to saved peer multiaddrs (for auto-reconnect on LAN/WAN).
 * Runs on init and refresh — silently ignores failures.
 */
async function connectToSavedPeers(): Promise<void> {
  const { savedPeerAddrs } = useStore.getState();
  if (savedPeerAddrs.length === 0) return;

  console.log(`[Collab:Bridge] Auto-connecting to ${savedPeerAddrs.length} saved peer(s)...`);
  for (const addr of savedPeerAddrs) {
    try {
      const result = await window.labAPI.ipfs.swarmConnect({ multiaddr: addr });
      if (result.success) {
        console.log(`[Collab:Bridge] ✓ Connected to saved peer: ${addr.slice(0, 40)}...`);
      } else {
        console.log(`[Collab:Bridge] ✗ Failed to connect to ${addr.slice(0, 40)}...: ${result.error}`);
      }
    } catch (e) {
      console.log(`[Collab:Bridge] ✗ Error connecting to ${addr.slice(0, 40)}...:`, e);
    }
  }
}

/**
 * Poll swarm peers, update the store, and send ping when new peers detected.
 * Runs in background every 5s — no UI component required.
 */
async function pollSwarmPeers(): Promise<void> {
  if (!collabInstance) return;

  try {
    const result = await window.labAPI.ipfs.swarmPeers();
    if (!result.success || !result.peers) return;

    // Save multiaddrs from connected peers for future auto-reconnect
    if (result.peers.length > 0) {
      const { savedPeerAddrs, addSavedPeerAddr } = useStore.getState();
      for (const addr of result.peers) {
        // Only save addrs with reachable IPs (not loopback)
        if (!addr.includes('/127.0.0.1/') && !addr.includes('/::1/') && !savedPeerAddrs.includes(addr)) {
          addSavedPeerAddr(addr);
          console.log(`[Collab:Bridge] Saved peer addr for auto-reconnect: ${addr.slice(0, 50)}...`);
        }
      }
    }

    const currentIds = new Set<string>();
    for (const addr of result.peers) {
      const id = parsePeerIdFromAddr(addr);
      if (id) currentIds.add(id);
    }

    // Diagnostic: log peer count + pubsub mesh status
    if (currentIds.size > 0 && collabInstance) {
      try {
        const meshResult = await window.labAPI.ipfs.pubsubPeers({ topic: collabInstance.roomTopic });
        const meshCount = meshResult.success ? meshResult.peers.length : -1;
        console.log(`[Collab:Bridge] Swarm poll: ${currentIds.size} swarm peer(s) [known=${knownSwarmPeers.size}] | pubsub mesh: ${meshCount} peer(s)`);
      } catch {
        console.log(`[Collab:Bridge] Swarm poll: ${currentIds.size} peer(s) [known=${knownSwarmPeers.size}]`);
      }
    } else {
      console.log(`[Collab:Bridge] Swarm poll: ${currentIds.size} peer(s) [known=${knownSwarmPeers.size}]`);
    }

    // Detect genuinely new peers (not seen in previous poll)
    let hasNewPeer = false;
    for (const id of currentIds) {
      if (!knownSwarmPeers.has(id)) {
        hasNewPeer = true;
        console.log(`[Collab:Bridge] New swarm peer detected: "${id.slice(0, 16)}..."`);
      }
    }

    // Clean pingedPeers for departed peers (allows re-ping if they return)
    for (const id of pingedPeers) {
      if (!currentIds.has(id)) {
        pingedPeers.delete(id);
      }
    }
    knownSwarmPeers = currentIds;

    // Merge with existing presence-enriched peers in store
    const existing = useStore.getState().peers;
    const existingById = new Map(existing.map((p) => [p.id, p]));
    const merged: import('../types').Peer[] = [];

    for (const id of currentIds) {
      const prev = existingById.get(id);
      if (prev) {
        merged.push({ ...prev, status: 'online', lastSeen: new Date().toISOString() });
      } else {
        merged.push({ id, name: '', status: 'online', lastSeen: new Date().toISOString() });
      }
    }
    // Keep recently-seen offline peers (presence said 'leaving' but not yet stale)
    for (const prev of existing) {
      if (!currentIds.has(prev.id) && prev.status === 'offline') {
        merged.push(prev);
      }
    }
    useStore.getState().setPeers(merged);

    // Layer 1: New peer → staggered pings to cover pubsub mesh propagation delay
    // The gossipsub mesh may need several seconds to propagate topic subscriptions
    // after a TCP swarm connection is established, so a single ping is often lost.
    if (hasNewPeer) {
      console.log(`[Collab:Bridge] New peer(s) — sending staggered discovery pings (0s, 2s, 5s)`);
      await sendPing(); // Immediate
      const delays = [2000, 5000];
      for (const delay of delays) {
        const timer = setTimeout(() => {
          console.log(`[Collab:Bridge] Staggered ping (+${delay / 1000}s)`);
          sendPing().catch(console.error);
          publishManifestIfChanged().catch(console.error);
        }, delay);
        discoveryRetryTimers.push(timer);
      }
    }
  } catch (e) {
    console.warn(`[Collab:Bridge] swarm poll error:`, e);
  }
}

/**
 * Force full protocol refresh (called by UI refresh button).
 * Runs all 3 layers:
 *   L1: Swarm scan + ping discovery
 *   L2: Force manifest broadcast + re-subscribe shared notebook topics
 *   L3: Ensure notebook topics are subscribed for collab
 */
export async function forceSwarmRefresh(): Promise<void> {
  if (!collabInstance) return;

  console.log(`[Collab:Bridge] forceSwarmRefresh — full 3-layer refresh`);

  // Layer 0: Auto-connect to saved peers
  await connectToSavedPeers();

  // Layer 1: Swarm scan + discovery ping
  await pollSwarmPeers();
  await sendPing();

  // Layer 2: Force manifest broadcast (reset hash to guarantee publish)
  lastManifestHash = '';
  await publishManifestIfChanged();

  // Layer 3: Re-subscribe to all shared notebook topics
  const { sharedNotebooks } = useStore.getState();
  for (const path of sharedNotebooks) {
    const rel = toRelativePath(path);
    await collabInstance.subscribeNotebook(rel);
  }

  console.log(`[Collab:Bridge] forceSwarmRefresh done — L1:ping L2:manifest(forced) L3:${sharedNotebooks.length} topic(s)`);
}

// ── Outgoing: debounced broadcast ─────────────────────

export function broadcastCellUpdate(notebookPath: string, cellId: string, source: string): void {
  if (!collabInstance || isRemoteUpdate()) return;

  const key = `${notebookPath}:${cellId}`;
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key);
    console.log(`[Collab:Bridge] >> broadcastCellUpdate nb="${notebookPath}" cell="${cellId.slice(0, 8)}" source(${source.length})`);
    collabInstance?.publishCellUpdate(notebookPath, cellId, source).catch(console.error);
    broadcastCursor(notebookPath, cellId);
  }, 300));
}

export function broadcastCellAdd(notebookPath: string, cellId: string, cellType: 'code' | 'markdown', afterIndex: number): void {
  if (!collabInstance || isRemoteUpdate()) return;
  console.log(`[Collab:Bridge] >> broadcastCellAdd nb="${notebookPath}" cell="${cellId.slice(0, 8)}" type=${cellType} after=${afterIndex}`);
  collabInstance.publishCellAdd(notebookPath, cellId, cellType, afterIndex).catch(console.error);
}

export function broadcastCellDelete(notebookPath: string, cellId: string): void {
  if (!collabInstance || isRemoteUpdate()) return;
  console.log(`[Collab:Bridge] >> broadcastCellDelete nb="${notebookPath}" cell="${cellId.slice(0, 8)}"`);
  collabInstance.publishCellDelete(notebookPath, cellId).catch(console.error);
}

export function broadcastCellTypeChange(notebookPath: string, cellId: string, newType: 'code' | 'markdown'): void {
  if (!collabInstance || isRemoteUpdate()) return;
  collabInstance.publishCellTypeChange(notebookPath, cellId, newType).catch(console.error);
}

export function broadcastCellMove(notebookPath: string, cellId: string, direction: 'up' | 'down'): void {
  if (!collabInstance || isRemoteUpdate()) return;
  collabInstance.publishCellMove(notebookPath, cellId, direction).catch(console.error);
}

export function broadcastCursor(notebookPath: string, cellId: string, x?: number, y?: number): void {
  if (!collabInstance || !ownPeerId) return;
  const { collabPseudo } = useStore.getState();

  const msg: CollabMessage = {
    type: 'cursor',
    from: ownPeerId,
    notebookPath,
    data: { cellId, peerName: collabPseudo || '', x, y },
    timestamp: Date.now(),
  };
  // Cursor → notebook topic (not room topic)
  const topic = collabInstance.notebookTopic(notebookPath);
  window.labAPI.ipfs.pubsubPublish({ topic, data: JSON.stringify(msg) }).catch(console.error);
}

export async function publishManifest(): Promise<void> {
  console.log(`[Collab:Bridge] publishManifest() called — instance: ${!!collabInstance}`);
  if (!collabInstance) return;
  await publishManifestIfChanged();
}

// ── History broadcast ─────────────────────────────────

export function broadcastHistoryPush(
  notebookPath: string,
  data: {
    nodeId: string;
    parentNodeId: string | null;
    action: HistoryAction;
    cells: CellSnapshot[];
    peerId: string;
    peerName?: string;
    timestamp: number;
  },
): void {
  if (!collabInstance) return;
  collabInstance.publishHistoryPush(notebookPath, data).catch(console.error);
}

export function broadcastNotebookState(
  notebookId: string,
  cells: CellSnapshot[],
  action: 'undo' | 'redo' | 'goto',
): void {
  if (!collabInstance) return;

  const { notebooks, sharedNotebooks } = useStore.getState();
  const nb = notebooks.find((n) => n.id === notebookId);
  if (!nb) return;

  const nbPath = nb.filePath || nb.fileName;
  const isRemoteNotebook = !nb.filePath && nb.fileName.startsWith('[');
  if (!isRemoteNotebook && !sharedNotebooks.includes(nbPath)) return;

  let notebookPath: string;
  if (isRemoteNotebook) {
    const match = nb.fileName.match(/^\[.*?\]\s*(.+)$/);
    notebookPath = match ? match[1] : nb.fileName;
  } else {
    notebookPath = toRelativePath(nbPath);
  }

  collabInstance.publishNotebookState(notebookPath, { cells, action }).catch(console.error);
}

// ── Open a peer's shared notebook ─────────────────────

export async function openPeerNotebook(peerId: string, notebookPath: string): Promise<void> {
  console.log(`[Collab:Bridge] openPeerNotebook peerId="${peerId.slice(0, 16)}..." nb="${notebookPath}"`);
  if (!collabInstance) {
    console.warn(`[Collab:Bridge] openPeerNotebook — no collab instance!`);
    return;
  }
  const { peerManifests } = useStore.getState();

  // Subscribe to that notebook's topic for live updates
  await collabInstance.subscribeNotebook(notebookPath);

  // Request the full notebook (all cell types: code + markdown)
  console.log(`[Collab:Bridge] Requesting full notebook from peer...`);
  const sharedCells = await collabInstance.codeShare.requestNotebook(peerId, notebookPath);
  console.log(`[Collab:Bridge] Received ${sharedCells.length} cells (${sharedCells.filter(c => c.cell_type === 'code').length} code + ${sharedCells.filter(c => c.cell_type === 'markdown').length} md)`);

  // Build cells from the structured response
  const cells: Cell[] = sharedCells.map((sc) => ({
    id: uuidv4(),
    cell_type: sc.cell_type,
    source: sc.source,
    outputs: [],
    execution_count: null,
    metadata: {},
  }));

  if (cells.length === 0) {
    cells.push({ id: uuidv4(), cell_type: 'code', source: '', outputs: [], execution_count: null, metadata: {} });
  }

  // Determine peer display name
  const manifest = peerManifests[peerId];
  const peerName = manifest?.peerName || peerId.slice(0, 8);
  const fileName = notebookPath.split('/').pop() || notebookPath;

  console.log(`[Collab:Bridge] Opening remote notebook "${fileName}" from "${peerName}" (${cells.length} cells)`);

  const nb: OpenNotebook = {
    id: uuidv4(),
    filePath: null, // Remote notebook
    fileName: `[${peerName}] ${fileName}`,
    data: {
      cells,
      metadata: { language_info: { name: 'python' } },
      nbformat: 4,
      nbformat_minor: 5,
    },
    dirty: false,
    kernelId: null,
  };

  useStore.getState().addNotebook(nb);
}

// ── Incoming message router ───────────────────────────

function handleIncomingMessage(msg: CollabMessage): void {
  // Ignore our own messages
  if (msg.from === ownPeerId) {
    return;
  }

  console.log(`[Collab:Bridge] << Incoming type="${msg.type}" from="${msg.from?.slice(0, 16)}..." nb="${msg.notebookPath}"`);

  switch (msg.type) {
    case 'ping':
      handlePing(msg);
      break;
    case 'pong':
      handlePong(msg);
      break;
    case 'cell-update':
      handleRemoteCellUpdate(msg);
      break;
    case 'cell-add':
      handleRemoteCellAdd(msg);
      break;
    case 'cell-delete':
      handleRemoteCellDelete(msg);
      break;
    case 'cell-type-change':
      handleRemoteCellTypeChange(msg);
      break;
    case 'cell-move':
      handleRemoteCellMove(msg);
      break;
    case 'cursor':
      handleRemoteCursor(msg);
      break;
    case 'presence':
      handlePresence(msg);
      break;
    case 'history-push':
      handleRemoteHistoryPush(msg);
      break;
    case 'notebook-state':
      handleRemoteNotebookState(msg);
      break;
    // share-manifest, code-request, code-response are handled by CollabService internally
  }
}

function findNotebookByPath(notebookPath: string): string | null {
  const { notebooks } = useStore.getState();
  const nb = notebooks.find((n) => {
    if (n.filePath) {
      return n.filePath.endsWith(notebookPath) || n.filePath === notebookPath;
    }
    // Remote notebooks have fileName like "[peerName] file.ipynb"
    return n.fileName.includes(notebookPath);
  });
  if (!nb) {
    console.log(`[Collab:Bridge] findNotebookByPath("${notebookPath}") — NOT FOUND among [${notebooks.map((n) => n.filePath || n.fileName).join(', ')}]`);
  }
  return nb?.id || null;
}

// ── Ping/Pong handlers (Layer 1 Discovery) ───────────

function handlePing(msg: CollabMessage): void {
  const { peerName } = msg.data as { peerId: string; peerName: string; protocolVersion: number };
  console.log(`[Collab:Bridge] << Ping from "${peerName || msg.from.slice(0, 8)}"`);

  // Update peer info in store
  useStore.getState().addPeer({
    id: msg.from,
    name: peerName || msg.from.slice(0, 8),
    status: 'online',
    lastSeen: new Date().toISOString(),
  });

  // Always respond with pong
  sendPong().catch(console.error);

  // Cascading discovery: if this peer was unknown, scan swarm for others
  if (!pingedPeers.has(msg.from)) {
    pingedPeers.add(msg.from);
    console.log(`[Collab:Bridge] Cascading: scanning swarm after ping from new peer`);
    pollSwarmPeers().catch(console.error);
  }

  // Publish our manifest so the pinging peer gets our shared files
  publishManifestIfChanged().catch(console.error);
}

function handlePong(msg: CollabMessage): void {
  const { peerName } = msg.data as { peerId: string; peerName: string; protocolVersion: number };
  console.log(`[Collab:Bridge] << Pong from "${peerName || msg.from.slice(0, 8)}"`);

  // Update peer info in store
  useStore.getState().addPeer({
    id: msg.from,
    name: peerName || msg.from.slice(0, 8),
    status: 'online',
    lastSeen: new Date().toISOString(),
  });

  // Publish our manifest so the ponging peer knows our shared files
  publishManifestIfChanged().catch(console.error);
}

// ── Presence handler (backward compat) ───────────────

function handlePresence(msg: CollabMessage): void {
  const { peerName, activeNotebook, sharedNotebooks, status } = msg.data as {
    peerName: string;
    activeNotebook: string | null;
    sharedNotebooks: string[];
    status: 'online' | 'leaving';
  };

  if (status === 'leaving') {
    console.log(`[Collab:Bridge] << Peer leaving: "${peerName || msg.from.slice(0, 8)}"`);
    useStore.getState().updatePeer(msg.from, { status: 'offline' });
    return;
  }

  useStore.getState().addPeer({
    id: msg.from,
    name: peerName || msg.from.slice(0, 8),
    status: 'online',
    lastSeen: new Date().toISOString(),
    activeNotebook: activeNotebook ?? undefined,
    sharedNotebooks,
  });
}

// ── Cell handlers ─────────────────────────────────────

function handleRemoteCellUpdate(msg: CollabMessage): void {
  const { cellId, source } = msg.data as { cellId: string; source: string };
  const nbId = findNotebookByPath(msg.notebookPath);
  if (!nbId) return;

  const peerName = (msg.data as Record<string, unknown>).peerName as string | undefined;
  console.log(`[Collab:Bridge] << Applying remote cell-update cell="${cellId.slice(0, 8)}" source(${source.length})`);
  _currentRemotePeer = { peerId: msg.from, peerName };
  setRemoteUpdate(true);
  useStore.getState().updateCellSource(nbId, cellId, source);
  setRemoteUpdate(false);
  _currentRemotePeer = null;
}

function handleRemoteCellAdd(msg: CollabMessage): void {
  const { cellId, cellType, afterIndex } = msg.data as {
    cellId: string;
    cellType: 'code' | 'markdown';
    afterIndex: number;
  };
  const nbId = findNotebookByPath(msg.notebookPath);
  if (!nbId) return;

  const peerName = (msg.data as Record<string, unknown>).peerName as string | undefined;
  console.log(`[Collab:Bridge] << Applying remote cell-add cell="${cellId.slice(0, 8)}" type=${cellType} after=${afterIndex}`);
  _currentRemotePeer = { peerId: msg.from, peerName };
  setRemoteUpdate(true);
  const nb = useStore.getState().notebooks.find((n) => n.id === nbId);
  if (nb) {
    const cells = [...nb.data.cells];
    const newCell: Cell = {
      id: cellId,
      cell_type: cellType,
      source: '',
      outputs: [],
      execution_count: null,
      metadata: {},
    };
    const idx = afterIndex !== undefined ? afterIndex + 1 : cells.length;
    cells.splice(idx, 0, newCell);
    useStore.getState().updateNotebookCells(nbId, cells);
  }
  setRemoteUpdate(false);
  _currentRemotePeer = null;
}

function handleRemoteCellDelete(msg: CollabMessage): void {
  const { cellId } = msg.data as { cellId: string };
  const nbId = findNotebookByPath(msg.notebookPath);
  if (!nbId) return;

  const peerName = (msg.data as Record<string, unknown>).peerName as string | undefined;
  console.log(`[Collab:Bridge] << Applying remote cell-delete cell="${cellId.slice(0, 8)}"`);
  _currentRemotePeer = { peerId: msg.from, peerName };
  setRemoteUpdate(true);
  useStore.getState().deleteCell(nbId, cellId);
  setRemoteUpdate(false);
  _currentRemotePeer = null;
}

function handleRemoteCellTypeChange(msg: CollabMessage): void {
  const { cellId, newType } = msg.data as { cellId: string; newType: 'code' | 'markdown' };
  const nbId = findNotebookByPath(msg.notebookPath);
  if (!nbId) return;

  _currentRemotePeer = { peerId: msg.from };
  setRemoteUpdate(true);
  useStore.getState().updateCellType(nbId, cellId, newType);
  setRemoteUpdate(false);
  _currentRemotePeer = null;
}

function handleRemoteCellMove(msg: CollabMessage): void {
  const { cellId, direction } = msg.data as { cellId: string; direction: 'up' | 'down' };
  const nbId = findNotebookByPath(msg.notebookPath);
  if (!nbId) return;

  _currentRemotePeer = { peerId: msg.from };
  setRemoteUpdate(true);
  if (direction === 'up') {
    useStore.getState().moveCellUp(nbId, cellId);
  } else {
    useStore.getState().moveCellDown(nbId, cellId);
  }
  setRemoteUpdate(false);
  _currentRemotePeer = null;
}

function handleRemoteCursor(msg: CollabMessage): void {
  const { cellId, peerName, x, y } = msg.data as { cellId: string; peerName?: string; x?: number; y?: number };
  useStore.getState().setRemoteCursor(msg.from, msg.notebookPath, cellId, peerName, x, y);
}

// ── History handlers ──────────────────────────────────

function handleRemoteHistoryPush(msg: CollabMessage): void {
  const data = msg.data as {
    nodeId: string;
    parentNodeId: string | null;
    action: HistoryAction;
    cells: CellSnapshot[];
    peerId: string;
    peerName?: string;
    timestamp: number;
  };
  const nbId = findNotebookByPath(msg.notebookPath);
  if (!nbId) return;

  console.log(`[Collab:Bridge] << Remote history-push node="${data.nodeId.slice(0, 8)}" from="${data.peerName || data.peerId.slice(0, 8)}"`);

  // Insert into local history tree with peer attribution
  useHistoryStore.getState().pushNode(
    nbId,
    data.action,
    data.cells,
    data.peerId,
    data.peerName,
  );
}

function handleRemoteNotebookState(msg: CollabMessage): void {
  const { cells, action } = msg.data as { cells: CellSnapshot[]; action: string };
  const nbId = findNotebookByPath(msg.notebookPath);
  if (!nbId) return;

  // Look up peer name from presence/manifest data
  const peer = useStore.getState().peers.find((p) => p.id === msg.from);
  const peerName = peer?.name || msg.from.slice(0, 8);

  console.log(`[Collab:Bridge] << Remote notebook-state action="${action}" cells=${cells.length} from="${peerName}"`);

  // Apply full cell state (like a remote undo/redo)
  _currentRemotePeer = { peerId: msg.from, peerName };
  setRemoteUpdate(true);
  restoreSnapshot(nbId, cells);
  setRemoteUpdate(false);
  _currentRemotePeer = null;
}
