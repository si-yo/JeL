/**
 * WebSocket Bridge Client
 * Connects mobile to desktop Lab instance
 */

type EventHandler = (event: BridgeEvent) => void;

export interface BridgeEvent {
  event: string;
  [key: string]: unknown;
}

export interface NotebookSummary {
  id: string;
  fileName: string;
  cellCount: number;
}

export interface CellData {
  id: string;
  cell_type: 'code' | 'markdown';
  source: string;
  outputs: Array<{
    output_type: string;
    text?: string | string[];
    data?: Record<string, string | string[]>;
    ename?: string;
    evalue?: string;
    traceback?: string[];
  }>;
  execution_count: number | null;
  metadata?: Record<string, unknown>;
}

export interface NotebookData {
  id: string;
  fileName: string;
  cells: CellData[];
}

class WsBridge {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string = '';
  private pin: string = '';
  connected = false;

  connect(host: string, pin: string): Promise<void> {
    this.url = `ws://${host}?token=${pin}`;
    this.pin = pin;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.connected = true;
          this.emit({ event: 'connected' });
          resolve();
        };

        this.ws.onclose = (e) => {
          this.connected = false;
          this.emit({ event: 'disconnected', code: e.code, reason: e.reason });
          if (e.code !== 4001) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = () => {
          if (!this.connected) {
            reject(new Error('Connexion impossible'));
          }
        };

        this.ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            this.emit(data);
          } catch {
            // ignore non-JSON
          }
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.connected && this.url) {
        this.connect(this.url.replace('ws://', '').split('?')[0], this.pin).catch(() => {
          this.scheduleReconnect();
        });
      }
    }, 3000);
  }

  private send(data: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private emit(event: BridgeEvent) {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  onEvent(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  listNotebooks() {
    this.send({ action: 'list-notebooks' });
  }

  getNotebook(notebookId: string) {
    this.send({ action: 'get-notebook', notebookId });
  }

  createNotebook() {
    this.send({ action: 'create-notebook' });
  }

  updateCell(notebookId: string, cellId: string, source: string) {
    this.send({ action: 'cell-update', notebookId, cellId, source });
  }

  runCell(notebookId: string, cellId: string) {
    this.send({ action: 'run-cell', notebookId, cellId });
  }

  addCell(notebookId: string, cellType: 'code' | 'markdown', afterIndex: number) {
    this.send({ action: 'add-cell', notebookId, cellType, afterIndex });
  }

  deleteCell(notebookId: string, cellId: string) {
    this.send({ action: 'delete-cell', notebookId, cellId });
  }

  toggleCellType(notebookId: string, cellId: string) {
    this.send({ action: 'toggle-cell-type', notebookId, cellId });
  }

  moveCellUp(notebookId: string, cellId: string) {
    this.send({ action: 'move-cell-up', notebookId, cellId });
  }

  moveCellDown(notebookId: string, cellId: string) {
    this.send({ action: 'move-cell-down', notebookId, cellId });
  }

  restartKernel(notebookId: string) {
    this.send({ action: 'restart-kernel', notebookId });
  }

  interruptKernel(notebookId: string) {
    this.send({ action: 'interrupt-kernel', notebookId });
  }

  getCollabStatus() {
    this.send({ action: 'get-collab-status' });
  }

  getHistory(notebookId: string) {
    this.send({ action: 'get-history', notebookId });
  }

  historyUndo(notebookId: string) {
    this.send({ action: 'history-undo', notebookId });
  }

  historyRedo(notebookId: string) {
    this.send({ action: 'history-redo', notebookId });
  }

  historyGoto(notebookId: string, nodeId: string) {
    this.send({ action: 'history-goto', notebookId, nodeId });
  }

  pipInstall(packages: string) {
    this.send({ action: 'pip-install', packages });
  }

  pipList() {
    this.send({ action: 'pip-list' });
  }
}

export const bridge = new WsBridge();
