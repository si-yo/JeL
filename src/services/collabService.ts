import type { CollabMessage } from '../types';
import type { HistoryAction, CellSnapshot } from './historyTypes';
import { CodeShareService } from './codeShareService';

type MessageHandler = (msg: CollabMessage) => void;

/**
 * Collaboration Service
 * Manages IPFS pubsub for real-time notebook collaboration
 *
 * Uses a single shared room topic (`lab:collab`) for discovery/manifests.
 * Notebook-specific topics (`lab:nb:<path>`) for cell-level edits.
 */
export class CollabService {
  private roomId: string;
  peerId: string;
  private subscribedTopics: Set<string> = new Set();
  private handler: MessageHandler | null = null;
  private pubsubCleanup: (() => void) | null = null;
  codeShare: CodeShareService;

  constructor(roomId: string, peerId: string) {
    this.roomId = roomId;
    this.peerId = peerId;
    this.codeShare = new CodeShareService(this);
    console.log(`[Collab] CollabService created — room="${roomId}" peerId="${peerId.slice(0, 16)}..."`);
  }

  /** Shared room topic (discovery, manifests, cursors) */
  get roomTopic(): string {
    return `lab:${this.roomId}`;
  }

  /** Notebook-specific topic for cell-level edits */
  notebookTopic(notebookPath: string): string {
    return `lab:nb:${notebookPath}`;
  }

  onMessage(handler: MessageHandler) {
    this.handler = handler;
  }

  /**
   * Start listening to the shared room topic
   */
  async joinProject(): Promise<void> {
    const topic = this.roomTopic;
    console.log(`[Collab] Subscribing to room topic: "${topic}"`);
    const result = await window.labAPI.ipfs.pubsubSubscribe({ topic });
    console.log(`[Collab] pubsubSubscribe("${topic}") result:`, result);
    this.subscribedTopics.add(topic);

    // Listen for incoming pubsub messages
    this.pubsubCleanup = window.labAPI.ipfs.onPubsubMessage(async (msg) => {
      console.log(`[Collab] << PUBSUB RECV topic="${msg.topic || '?'}" len=${msg.data?.length || 0}`);
      const messages = this.parseMessages(msg.data);
      for (const parsed of messages) {
        console.log(`[Collab] << MSG type="${parsed.type}" from="${parsed.from?.slice(0, 16)}..." nb="${parsed.notebookPath}"`);
        if (parsed.type === 'share-manifest' || parsed.type === 'code-request' || parsed.type === 'code-response') {
          await this.codeShare.handleMessage(parsed);
        }
        if (this.handler) this.handler(parsed);
      }
    });
    console.log(`[Collab] Joined room topic "${topic}", listener registered`);
  }

  /**
   * Subscribe to a specific notebook's topic
   */
  async subscribeNotebook(notebookPath: string): Promise<void> {
    const topic = this.notebookTopic(notebookPath);
    if (this.subscribedTopics.has(topic)) {
      console.log(`[Collab] Already subscribed to "${topic}"`);
      return;
    }
    console.log(`[Collab] Subscribing to notebook topic: "${topic}"`);
    await window.labAPI.ipfs.pubsubSubscribe({ topic });
    this.subscribedTopics.add(topic);
  }

  /**
   * Unsubscribe from a notebook's topic
   */
  async unsubscribeNotebook(notebookPath: string): Promise<void> {
    const topic = this.notebookTopic(notebookPath);
    if (!this.subscribedTopics.has(topic)) return;
    console.log(`[Collab] Unsubscribing from notebook topic: "${topic}"`);
    await window.labAPI.ipfs.pubsubUnsubscribe({ topic });
    this.subscribedTopics.delete(topic);
  }

  /**
   * Publish a cell change to peers
   */
  async publishCellUpdate(notebookPath: string, cellId: string, source: string): Promise<void> {
    const msg: CollabMessage = {
      type: 'cell-update',
      from: this.peerId,
      notebookPath,
      data: { cellId, source },
      timestamp: Date.now(),
    };

    const nbTopic = this.notebookTopic(notebookPath);
    console.log(`[Collab] >> cell-update on "${nbTopic}" cellId=${cellId.slice(0, 8)}`);
    await window.labAPI.ipfs.pubsubPublish({ topic: nbTopic, data: JSON.stringify(msg) });
  }

  /**
   * Publish a new cell added
   */
  async publishCellAdd(
    notebookPath: string,
    cellId: string,
    cellType: 'code' | 'markdown',
    afterIndex: number
  ): Promise<void> {
    const msg: CollabMessage = {
      type: 'cell-add',
      from: this.peerId,
      notebookPath,
      data: { cellId, cellType, afterIndex },
      timestamp: Date.now(),
    };
    console.log(`[Collab] >> cell-add "${notebookPath}" type=${cellType} after=${afterIndex}`);
    await window.labAPI.ipfs.pubsubPublish({ topic: this.notebookTopic(notebookPath), data: JSON.stringify(msg) });
  }

  /**
   * Publish cell deletion
   */
  async publishCellDelete(notebookPath: string, cellId: string): Promise<void> {
    const msg: CollabMessage = {
      type: 'cell-delete',
      from: this.peerId,
      notebookPath,
      data: { cellId },
      timestamp: Date.now(),
    };
    console.log(`[Collab] >> cell-delete "${notebookPath}" cellId=${cellId.slice(0, 8)}`);
    await window.labAPI.ipfs.pubsubPublish({ topic: this.notebookTopic(notebookPath), data: JSON.stringify(msg) });
  }

  /**
   * Publish cell move (up/down)
   */
  async publishCellMove(notebookPath: string, cellId: string, direction: 'up' | 'down'): Promise<void> {
    const msg: CollabMessage = {
      type: 'cell-move',
      from: this.peerId,
      notebookPath,
      data: { cellId, direction },
      timestamp: Date.now(),
    };
    await window.labAPI.ipfs.pubsubPublish({ topic: this.notebookTopic(notebookPath), data: JSON.stringify(msg) });
  }

  /**
   * Publish cell type change (code ↔ markdown)
   */
  async publishCellTypeChange(notebookPath: string, cellId: string, newType: 'code' | 'markdown'): Promise<void> {
    const msg: CollabMessage = {
      type: 'cell-type-change',
      from: this.peerId,
      notebookPath,
      data: { cellId, newType },
      timestamp: Date.now(),
    };
    await window.labAPI.ipfs.pubsubPublish({ topic: this.notebookTopic(notebookPath), data: JSON.stringify(msg) });
  }

  /**
   * Publish presence heartbeat on room topic
   */
  async publishPresence(data: {
    peerName: string;
    activeNotebook: string | null;
    sharedNotebooks: string[];
    status: 'online' | 'leaving';
  }): Promise<void> {
    const msg: CollabMessage = {
      type: 'presence',
      from: this.peerId,
      notebookPath: '',
      data,
      timestamp: Date.now(),
    };
    await window.labAPI.ipfs.pubsubPublish({ topic: this.roomTopic, data: JSON.stringify(msg) });
  }

  /**
   * Publish a ping message to room topic (Layer 1 discovery)
   */
  async publishPing(data: { peerId: string; peerName: string; protocolVersion: number }): Promise<void> {
    const msg: CollabMessage = {
      type: 'ping',
      from: this.peerId,
      notebookPath: '',
      data,
      timestamp: Date.now(),
    };
    await window.labAPI.ipfs.pubsubPublish({ topic: this.roomTopic, data: JSON.stringify(msg) });
  }

  /**
   * Publish a pong message to room topic (Layer 1 discovery response)
   */
  async publishPong(data: { peerId: string; peerName: string; protocolVersion: number }): Promise<void> {
    const msg: CollabMessage = {
      type: 'pong',
      from: this.peerId,
      notebookPath: '',
      data,
      timestamp: Date.now(),
    };
    await window.labAPI.ipfs.pubsubPublish({ topic: this.roomTopic, data: JSON.stringify(msg) });
  }

  /**
   * Publish a history node to a notebook topic
   */
  async publishHistoryPush(notebookPath: string, data: {
    nodeId: string;
    parentNodeId: string | null;
    action: HistoryAction;
    cells: CellSnapshot[];
    peerId: string;
    peerName?: string;
    timestamp: number;
  }): Promise<void> {
    const msg: CollabMessage = {
      type: 'history-push',
      from: this.peerId,
      notebookPath,
      data,
      timestamp: Date.now(),
    };
    const topic = this.notebookTopic(notebookPath);
    console.log(`[Collab] >> history-push on "${topic}" nodeId=${data.nodeId.slice(0, 8)}`);
    await window.labAPI.ipfs.pubsubPublish({ topic, data: JSON.stringify(msg) });
  }

  /**
   * Publish full notebook state (undo/redo result) to a notebook topic
   */
  async publishNotebookState(notebookPath: string, data: {
    cells: CellSnapshot[];
    action: 'undo' | 'redo' | 'goto';
  }): Promise<void> {
    const msg: CollabMessage = {
      type: 'notebook-state',
      from: this.peerId,
      notebookPath,
      data,
      timestamp: Date.now(),
    };
    const topic = this.notebookTopic(notebookPath);
    console.log(`[Collab] >> notebook-state on "${topic}" action=${data.action} cells=${data.cells.length}`);
    await window.labAPI.ipfs.pubsubPublish({ topic, data: JSON.stringify(msg) });
  }

  /**
   * Share a full notebook via CID
   */
  async shareNotebookCID(notebookPath: string, content: string): Promise<string | null> {
    console.log(`[Collab] >> shareNotebookCID "${notebookPath}" (${content.length} chars)`);
    const result = await window.labAPI.ipfs.addData({
      data: content,
      name: notebookPath,
    });
    console.log(`[Collab] addData result:`, result);

    if (!result.success || !result.cid) return null;

    const msg: CollabMessage = {
      type: 'notebook-share',
      from: this.peerId,
      notebookPath,
      data: { cid: result.cid },
      timestamp: Date.now(),
    };

    await window.labAPI.ipfs.pubsubPublish({ topic: this.roomTopic, data: JSON.stringify(msg) });
    return result.cid;
  }

  /**
   * Fetch a notebook by CID
   */
  async fetchNotebookByCID(cid: string): Promise<string | null> {
    const result = await window.labAPI.ipfs.cat({ cid });
    return result.success ? (result.data ?? null) : null;
  }

  /**
   * Parse potentially concatenated JSON messages from pubsub.
   * Kubo may flush multiple messages without separators: {...}{...}
   */
  private parseMessages(data: string): CollabMessage[] {
    if (!data) return [];
    try {
      return [JSON.parse(data)];
    } catch {
      // Try splitting concatenated JSON objects
    }
    const results: CollabMessage[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (ch === '"') {
        i++;
        while (i < data.length && data[i] !== '"') {
          if (data[i] === '\\') i++;
          i++;
        }
      } else if (ch === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            results.push(JSON.parse(data.slice(start, i + 1)));
          } catch (err) {
            console.warn(`[Collab] << Failed to parse split message:`, err);
          }
        }
      }
    }
    if (results.length === 0) {
      console.warn(`[Collab] << Could not parse any messages from data (${data.length} chars):`, data.slice(0, 200));
    }
    return results;
  }

  /**
   * Leave the project and unsubscribe from all topics
   */
  async leaveProject(): Promise<void> {
    console.log(`[Collab] Leaving — unsubscribing from ${this.subscribedTopics.size} topics`);
    for (const topic of this.subscribedTopics) {
      await window.labAPI.ipfs.pubsubUnsubscribe({ topic });
    }
    this.subscribedTopics.clear();
    this.pubsubCleanup?.();
    this.pubsubCleanup = null;
    this.handler = null;
    this.codeShare.destroy();
  }

  /**
   * Poll IPFS swarm peers
   */
  async getPeers(): Promise<string[]> {
    const result = await window.labAPI.ipfs.swarmPeers();
    return result.success ? (result.peers ?? []) : [];
  }
}
