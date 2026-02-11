// Notebook cell types
export type CellType = 'code' | 'markdown';

export interface CellOutput {
  output_type: 'stream' | 'execute_result' | 'display_data' | 'error';
  // stream
  name?: 'stdout' | 'stderr';
  text?: string | string[];
  // execute_result / display_data
  data?: Record<string, string | string[]>;
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  // error
  ename?: string;
  evalue?: string;
  traceback?: string[];
}

export interface Cell {
  id: string;
  cell_type: CellType;
  source: string;
  outputs: CellOutput[];
  execution_count: number | null;
  metadata: Record<string, unknown>;
}

export interface NotebookMetadata {
  kernelspec?: {
    display_name: string;
    language: string;
    name: string;
  };
  language_info?: {
    name: string;
    version?: string;
  };
  [key: string]: unknown;
}

export interface NotebookData {
  cells: Cell[];
  metadata: NotebookMetadata;
  nbformat: number;
  nbformat_minor: number;
}

export interface OpenNotebook {
  id: string;
  filePath: string | null; // null = unsaved
  fileName: string;
  data: NotebookData;
  dirty: boolean;
  kernelId: string | null;
}

export type KernelState = 'idle' | 'busy' | 'starting' | 'dead' | 'disconnected';

export interface KernelInfo {
  id: string;
  name: string;
  state: KernelState;
  wsUrl: string | null;
}

export interface JupyterStatus {
  running: boolean;
  port: number;
  token: string;
}

// ===========================================
// Project types
// ===========================================

export interface Project {
  id: string;
  name: string;
  path: string;
  swarmKey: string | null;
  notebooks: string[];
  createdAt: string;
  venvPath?: string;
  venvReady?: boolean;
}

export interface FavoriteProject {
  path: string;
  name: string;
  lastOpened: string;
}

// ===========================================
// P2P / Collaboration types
// ===========================================

export interface Peer {
  id: string;
  name: string;
  status: 'online' | 'offline';
  lastSeen: string;
  activeNotebook?: string;
  sharedNotebooks?: string[];
}

export interface CollabMessage {
  type: 'cell-update' | 'cell-add' | 'cell-delete' | 'cell-type-change' | 'cell-move' | 'cursor' | 'notebook-share'
    | 'share-manifest' | 'code-request' | 'code-response'
    | 'presence' | 'history-push' | 'notebook-state'
    | 'ping' | 'pong';
  from: string;
  notebookPath: string;
  data: unknown;
  timestamp: number;
}

export interface SharedNotebookInfo {
  path: string;
  name: string;
  cellCount: number;
  exports: string[];
  shareMode: 'full' | 'exports-only';
}

export interface ShareManifest {
  peerId: string;
  peerName: string;
  notebooks: SharedNotebookInfo[];
}

export interface NotebookLink {
  targetNotebook: string;
  targetCellId?: string;
  label: string;
}

export interface SwarmKeyEntry {
  name: string;
  key: string;
}

// ===========================================
// Window API types
// ===========================================

declare global {
  interface Window {
    labAPI: {
      jupyter: {
        start: (options?: { port?: number; token?: string; notebookDir?: string }) => Promise<{ success: boolean; port?: number; token?: string; error?: string; message?: string }>;
        stop: () => Promise<{ success: boolean; error?: string }>;
        status: () => Promise<JupyterStatus>;
        onStopped: (callback: () => void) => () => void;
      };
      fs: {
        readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
        writeFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>;
        exists: (filePath: string) => Promise<boolean>;
        readDir: (dirPath: string) => Promise<{ success: boolean; entries?: { name: string; isDirectory: boolean }[]; error?: string }>;
      };
      dialog: {
        openFile: (options?: Record<string, unknown>) => Promise<{ canceled: boolean; filePaths: string[] }>;
        saveFile: (options?: Record<string, unknown>) => Promise<{ canceled: boolean; filePath?: string }>;
        openDirectory: () => Promise<{ canceled: boolean; filePaths: string[] }>;
      };
      getPath: (name: string) => Promise<string>;
      onMenuEvent: (callback: (event: string) => void) => () => void;

      project: {
        create: (params: { name: string; path: string }) => Promise<{ success: boolean; project?: Project; error?: string }>;
        open: (path: string) => Promise<{ success: boolean; project?: Project; error?: string }>;
        save: (path: string, data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
        listNotebooks: (path: string) => Promise<{ success: boolean; notebooks?: string[]; error?: string }>;
        getFavorites: () => Promise<FavoriteProject[]>;
        saveFavorites: (favorites: FavoriteProject[]) => Promise<{ success: boolean }>;
        close: () => Promise<{ success: boolean }>;
      };

      venv: {
        status: () => Promise<{ active: boolean; path: string | null; ready: boolean; projectPath: string | null }>;
      };

      ipfs: {
        available: () => Promise<{ available: boolean }>;
        repoExists: () => Promise<{ exists: boolean }>;
        init: () => Promise<{ success: boolean; message?: string; error?: string }>;
        daemonStart: () => Promise<{ success: boolean; error?: string }>;
        daemonStop: () => Promise<{ success: boolean; error?: string }>;
        status: () => Promise<{ running: boolean }>;
        addData: (params: { data: string; name?: string }) => Promise<{ success: boolean; cid?: string; error?: string }>;
        cat: (params: { cid: string }) => Promise<{ success: boolean; data?: string; error?: string }>;
        pubsubSubscribe: (params: { topic: string }) => Promise<{ success: boolean; error?: string }>;
        pubsubPublish: (params: { topic: string; data: string }) => Promise<{ success: boolean; error?: string }>;
        pubsubUnsubscribe: (params: { topic: string }) => Promise<{ success: boolean; error?: string }>;
        pubsubPeers: (params: { topic: string }) => Promise<{ success: boolean; peers: string[]; error?: string }>;
        swarmPeers: () => Promise<{ success: boolean; peers?: string[]; error?: string }>;
        getNodeInfo: () => Promise<{ success: boolean; peerId?: string; addrs?: string[]; error?: string }>;
        swarmConnect: (params: { multiaddr: string }) => Promise<{ success: boolean; error?: string }>;
        swarmKeyGenerate: () => Promise<{ key: string }>;
        swarmKeyList: () => Promise<SwarmKeyEntry[]>;
        swarmKeySave: (entry: SwarmKeyEntry) => Promise<{ success: boolean }>;
        swarmKeyDelete: (name: string) => Promise<{ success: boolean }>;
        swarmKeyApply: (name: string) => Promise<{ success: boolean; error?: string }>;
        swarmKeyClear: () => Promise<{ success: boolean }>;
        swarmKeyActive: () => Promise<{ active: boolean; name?: string | null; key?: string }>;
        onSwarmChanged: (callback: (data: { active: boolean; name?: string }) => void) => () => void;
        onPubsubMessage: (callback: (msg: { topic: string; data: string }) => void) => () => void;
      };

      notebook: {
        exportPDF: (data: { html: string; title: string }) => Promise<{ success: boolean; path?: string }>;
      };

      pip: {
        install: (params: { packages: string | string[] }) => Promise<{ success: boolean; output?: string; error?: string; code?: number }>;
        list: () => Promise<{ success: boolean; packages?: Array<{ name: string; version: string }>; error?: string }>;
        onOutput: (callback: (data: { text: string; stream: 'stdout' | 'stderr' }) => void) => () => void;
      };

      bridge: {
        start: () => Promise<{ success: boolean; port?: number; pin?: string; ip?: string; error?: string }>;
        stop: () => Promise<{ success: boolean; error?: string }>;
        status: () => Promise<{ running: boolean; port: number; pin: string | null; ip: string; clients: number }>;
        onClientCount: (callback: (count: number) => void) => () => void;
        onRequest: (callback: (req: { action: string; wsId: number; [key: string]: unknown }) => void) => () => void;
        respond: (wsId: number, data: unknown) => void;
        broadcast: (data: unknown) => void;
      };
    };
  }
}
