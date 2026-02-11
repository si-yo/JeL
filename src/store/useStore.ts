import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { OpenNotebook, Cell, CellOutput, KernelState, Project, FavoriteProject, Peer, ShareManifest, SwarmKeyEntry, SoaServiceInfo } from '../types';
import { createEmptyNotebook, createCell } from '../utils/notebook';

// Remote update guard — prevents re-broadcasting incoming peer edits
let _isRemoteUpdate = false;
export function setRemoteUpdate(v: boolean) { _isRemoteUpdate = v; }
export function isRemoteUpdate(): boolean { return _isRemoteUpdate; }

// History restore guard — prevents capturing undo/redo as new actions
let _isHistoryRestore = false;
export function setHistoryRestore(v: boolean) { _isHistoryRestore = v; }
export function isHistoryRestore(): boolean { return _isHistoryRestore; }

export interface RemoteCursor {
  peerId: string;
  notebookPath: string;
  cellId: string;
  peerName?: string;
  timestamp: number;
  x?: number;
  y?: number;
  visible: boolean;
}

interface LabStore {
  // Notebooks
  notebooks: OpenNotebook[];
  activeNotebookId: string | null;

  // Project
  currentProject: Project | null;
  favoriteProjects: FavoriteProject[];

  // Jupyter server
  jupyterRunning: boolean;
  jupyterPort: number;
  jupyterToken: string;

  // IPFS / P2P
  ipfsAvailable: boolean | null; // null = not checked yet
  ipfsRunning: boolean;
  collabEnabled: boolean;
  collabPseudo: string; // user display name for collab sessions
  peers: Peer[];
  swarmKeys: SwarmKeyEntry[];
  activeSwarmKey: string | null; // name of active key, null = public

  // Bridge (mobile)
  bridgeRunning: boolean;
  bridgePin: string | null;
  bridgeIp: string | null;
  bridgeClients: number;

  // Code sharing (%ask)
  sharedNotebooks: string[];
  peerManifests: Record<string, ShareManifest>;

  // Saved peer multiaddrs for auto-reconnect (persisted to localStorage)
  savedPeerAddrs: string[];

  // Collab cursors
  remoteCursors: Record<string, RemoteCursor>;

  // Editor
  autocompleteEnabled: boolean;

  // SOA
  soaEnabled: boolean;
  soaRunningServices: SoaServiceInfo[];
  soaAvailableServices: SoaServiceInfo[];

  // Kernel states (per notebook)
  kernelStates: Record<string, KernelState>;

  // Actions - Notebooks
  addNotebook: (nb: OpenNotebook) => void;
  removeNotebook: (id: string) => void;
  setActiveNotebook: (id: string) => void;
  markDirty: (id: string) => void;
  markClean: (id: string, filePath?: string) => void;
  updateNotebookCells: (id: string, cells: Cell[]) => void;

  // Actions - Cells
  addCell: (notebookId: string, type: 'code' | 'markdown', afterIndex?: number) => void;
  deleteCell: (notebookId: string, cellId: string) => void;
  updateCellSource: (notebookId: string, cellId: string, source: string) => void;
  updateCellType: (notebookId: string, cellId: string, type: 'code' | 'markdown') => void;
  setCellOutputs: (notebookId: string, cellId: string, outputs: CellOutput[]) => void;
  appendCellOutput: (notebookId: string, cellId: string, output: CellOutput) => void;
  setCellExecutionCount: (notebookId: string, cellId: string, count: number | null) => void;
  clearCellOutputs: (notebookId: string, cellId: string) => void;
  updateCellMetadata: (notebookId: string, cellId: string, metadata: Record<string, unknown>) => void;
  moveCellUp: (notebookId: string, cellId: string) => void;
  moveCellDown: (notebookId: string, cellId: string) => void;
  insertCellsAfter: (notebookId: string, afterCellId: string | null, cells: Cell[]) => void;
  deleteCells: (notebookId: string, cellIds: string[]) => void;

  // Actions - Project
  setCurrentProject: (project: Project | null) => void;
  setFavoriteProjects: (favorites: FavoriteProject[]) => void;
  addFavorite: (fav: FavoriteProject) => void;
  removeFavorite: (path: string) => void;

  // Actions - Jupyter
  setJupyterRunning: (running: boolean, port?: number, token?: string) => void;
  setKernelState: (notebookId: string, state: KernelState) => void;
  setKernelId: (notebookId: string, kernelId: string | null) => void;

  // Actions - IPFS / P2P
  setIpfsAvailable: (available: boolean) => void;
  setIpfsRunning: (running: boolean) => void;
  setCollabEnabled: (enabled: boolean) => void;
  setCollabPseudo: (pseudo: string) => void;
  setPeers: (peers: Peer[]) => void;
  addPeer: (peer: Peer) => void;
  removePeer: (id: string) => void;
  updatePeer: (id: string, updates: Partial<Peer>) => void;
  cleanStalePeers: () => void;
  setSwarmKeys: (keys: SwarmKeyEntry[]) => void;
  setActiveSwarmKey: (name: string | null) => void;

  // Actions - Bridge
  setBridgeRunning: (running: boolean, pin?: string | null, ip?: string | null) => void;
  setBridgeClients: (count: number) => void;

  // Actions - Code sharing
  setSharedNotebooks: (paths: string[]) => void;
  toggleShareNotebook: (path: string) => void;
  setPeerManifest: (peerId: string, manifest: ShareManifest) => void;
  removePeerManifest: (peerId: string) => void;

  // Actions - Saved peer addrs
  addSavedPeerAddr: (addr: string) => void;
  removeSavedPeerAddr: (addr: string) => void;
  setSavedPeerAddrs: (addrs: string[]) => void;

  // Actions - Collab cursors
  setRemoteCursor: (peerId: string, notebookPath: string, cellId: string, peerName?: string, x?: number, y?: number) => void;
  toggleCursorVisibility: (peerId: string) => void;
  clearRemoteCursor: (peerId: string) => void;
  clearStaleCursors: () => void;

  // Actions - Editor
  setAutocompleteEnabled: (enabled: boolean) => void;

  // Actions - SOA
  setSoaEnabled: (enabled: boolean) => void;
  addSoaRunningService: (service: SoaServiceInfo) => void;
  removeSoaRunningService: (name: string) => void;
  updateSoaAvailableService: (service: SoaServiceInfo) => void;
  removeSoaAvailableService: (name: string, peerId: string) => void;
  clearSoaServices: () => void;

  // Helpers
  createNewNotebook: () => string;
  getActiveNotebook: () => OpenNotebook | undefined;
}

export const useStore = create<LabStore>((set, get) => ({
  notebooks: [],
  activeNotebookId: null,
  currentProject: null,
  favoriteProjects: [],
  jupyterRunning: false,
  jupyterPort: 8888,
  jupyterToken: '',
  ipfsAvailable: null,
  ipfsRunning: false,
  collabEnabled: false,
  collabPseudo: localStorage.getItem('lab:pseudo') || '',
  peers: [],
  swarmKeys: [],
  activeSwarmKey: null,
  kernelStates: {},
  bridgeRunning: false,
  bridgePin: null,
  bridgeIp: null,
  bridgeClients: 0,
  sharedNotebooks: [],
  peerManifests: {},
  savedPeerAddrs: JSON.parse(localStorage.getItem('lab:peerAddrs') || '[]'),
  remoteCursors: {},
  autocompleteEnabled: true,
  soaEnabled: false,
  soaRunningServices: [],
  soaAvailableServices: [],

  // Notebook actions
  addNotebook: (nb) =>
    set((s) => ({ notebooks: [...s.notebooks, nb], activeNotebookId: nb.id })),

  removeNotebook: (id) =>
    set((s) => {
      const filtered = s.notebooks.filter((n) => n.id !== id);
      const newActive =
        s.activeNotebookId === id
          ? filtered[filtered.length - 1]?.id ?? null
          : s.activeNotebookId;
      return { notebooks: filtered, activeNotebookId: newActive };
    }),

  setActiveNotebook: (id) => set({ activeNotebookId: id }),

  markDirty: (id) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => (n.id === id ? { ...n, dirty: true } : n)),
    })),

  markClean: (id, filePath) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) =>
        n.id === id
          ? {
              ...n,
              dirty: false,
              ...(filePath
                ? { filePath, fileName: filePath.split('/').pop() || 'notebook.ipynb' }
                : {}),
            }
          : n
      ),
    })),

  updateNotebookCells: (id, cells) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, cells }, dirty: true } : n
      ),
    })),

  // Cell actions
  addCell: (notebookId, type, afterIndex) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        const cells = [...n.data.cells];
        const idx = afterIndex !== undefined ? afterIndex + 1 : cells.length;
        cells.splice(idx, 0, createCell(type));
        return { ...n, data: { ...n.data, cells }, dirty: true };
      }),
    })),

  deleteCell: (notebookId, cellId) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        const cells = n.data.cells.filter((c) => c.id !== cellId);
        if (cells.length === 0) cells.push(createCell('code'));
        return { ...n, data: { ...n.data, cells }, dirty: true };
      }),
    })),

  updateCellSource: (notebookId, cellId, source) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            cells: n.data.cells.map((c) => (c.id === cellId ? { ...c, source } : c)),
          },
          dirty: true,
        };
      }),
    })),

  updateCellType: (notebookId, cellId, type) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            cells: n.data.cells.map((c) =>
              c.id === cellId
                ? { ...c, cell_type: type, outputs: type === 'markdown' ? [] : c.outputs }
                : c
            ),
          },
          dirty: true,
        };
      }),
    })),

  setCellOutputs: (notebookId, cellId, outputs) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            cells: n.data.cells.map((c) => (c.id === cellId ? { ...c, outputs } : c)),
          },
        };
      }),
    })),

  appendCellOutput: (notebookId, cellId, output) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            cells: n.data.cells.map((c) =>
              c.id === cellId ? { ...c, outputs: [...c.outputs, output] } : c
            ),
          },
        };
      }),
    })),

  setCellExecutionCount: (notebookId, cellId, count) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            cells: n.data.cells.map((c) =>
              c.id === cellId ? { ...c, execution_count: count } : c
            ),
          },
        };
      }),
    })),

  clearCellOutputs: (notebookId, cellId) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            cells: n.data.cells.map((c) =>
              c.id === cellId ? { ...c, outputs: [], execution_count: null } : c
            ),
          },
        };
      }),
    })),

  updateCellMetadata: (notebookId, cellId, metadata) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            cells: n.data.cells.map((c) =>
              c.id === cellId ? { ...c, metadata: { ...c.metadata, ...metadata } } : c
            ),
          },
          dirty: true,
        };
      }),
    })),

  moveCellUp: (notebookId, cellId) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        const cells = [...n.data.cells];
        const idx = cells.findIndex((c) => c.id === cellId);
        if (idx <= 0) return n;
        [cells[idx - 1], cells[idx]] = [cells[idx], cells[idx - 1]];
        return { ...n, data: { ...n.data, cells }, dirty: true };
      }),
    })),

  moveCellDown: (notebookId, cellId) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        const cells = [...n.data.cells];
        const idx = cells.findIndex((c) => c.id === cellId);
        if (idx < 0 || idx >= cells.length - 1) return n;
        [cells[idx], cells[idx + 1]] = [cells[idx + 1], cells[idx]];
        return { ...n, data: { ...n.data, cells }, dirty: true };
      }),
    })),

  insertCellsAfter: (notebookId, afterCellId, newCells) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        const cells = [...n.data.cells];
        const idx = afterCellId ? cells.findIndex((c) => c.id === afterCellId) : -1;
        cells.splice(idx + 1, 0, ...newCells);
        return { ...n, data: { ...n.data, cells }, dirty: true };
      }),
    })),

  deleteCells: (notebookId, cellIds) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => {
        if (n.id !== notebookId) return n;
        const idSet = new Set(cellIds);
        const cells = n.data.cells.filter((c) => !idSet.has(c.id));
        if (cells.length === 0) cells.push(createCell('code'));
        return { ...n, data: { ...n.data, cells }, dirty: true };
      }),
    })),

  // Project actions
  setCurrentProject: (project) => set({ currentProject: project }),

  setFavoriteProjects: (favorites) => set({ favoriteProjects: favorites }),

  addFavorite: (fav) =>
    set((s) => {
      const filtered = s.favoriteProjects.filter((f) => f.path !== fav.path);
      return { favoriteProjects: [fav, ...filtered] };
    }),

  removeFavorite: (path) =>
    set((s) => ({
      favoriteProjects: s.favoriteProjects.filter((f) => f.path !== path),
    })),

  // Jupyter actions
  setJupyterRunning: (running, port, token) =>
    set({
      jupyterRunning: running,
      ...(port !== undefined ? { jupyterPort: port } : {}),
      ...(token !== undefined ? { jupyterToken: token } : {}),
    }),

  setKernelState: (notebookId, state) =>
    set((s) => ({ kernelStates: { ...s.kernelStates, [notebookId]: state } })),

  setKernelId: (notebookId, kernelId) =>
    set((s) => ({
      notebooks: s.notebooks.map((n) => (n.id === notebookId ? { ...n, kernelId } : n)),
    })),

  // IPFS / P2P actions
  setIpfsAvailable: (available) => set({ ipfsAvailable: available }),
  setIpfsRunning: (running) => set({ ipfsRunning: running }),

  setCollabEnabled: (enabled) => set({ collabEnabled: enabled }),

  setCollabPseudo: (pseudo) => {
    localStorage.setItem('lab:pseudo', pseudo);
    set({ collabPseudo: pseudo });
  },

  setPeers: (peers) => set({ peers }),

  addPeer: (peer) =>
    set((s) => {
      const exists = s.peers.find((p) => p.id === peer.id);
      if (exists) {
        return { peers: s.peers.map((p) => (p.id === peer.id ? { ...p, ...peer } : p)) };
      }
      return { peers: [...s.peers, peer] };
    }),

  removePeer: (id) =>
    set((s) => ({ peers: s.peers.filter((p) => p.id !== id) })),

  updatePeer: (id, updates) =>
    set((s) => ({
      peers: s.peers.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),

  cleanStalePeers: () =>
    set((s) => {
      const now = Date.now();
      const peerManifests = { ...s.peerManifests };
      const peers = s.peers
        .map((p) => {
          const age = now - new Date(p.lastSeen).getTime();
          if (age > 60000 && p.status === 'online') return { ...p, status: 'offline' as const };
          return p;
        })
        .filter((p) => {
          const age = now - new Date(p.lastSeen).getTime();
          if (age > 180000) {
            delete peerManifests[p.id];
            return false;
          }
          return true;
        });
      return { peers, peerManifests };
    }),

  setSwarmKeys: (keys) => set({ swarmKeys: keys }),
  setActiveSwarmKey: (name) => set({ activeSwarmKey: name }),

  // Bridge actions
  setBridgeRunning: (running, pin, ip) =>
    set({ bridgeRunning: running, bridgePin: pin ?? null, bridgeIp: ip ?? null }),

  setBridgeClients: (count) => set({ bridgeClients: count }),

  // Code sharing actions
  setSharedNotebooks: (paths) => set({ sharedNotebooks: paths }),

  toggleShareNotebook: (p) =>
    set((s) => {
      const has = s.sharedNotebooks.includes(p);
      return { sharedNotebooks: has ? s.sharedNotebooks.filter((x) => x !== p) : [...s.sharedNotebooks, p] };
    }),

  setPeerManifest: (peerId, manifest) =>
    set((s) => ({ peerManifests: { ...s.peerManifests, [peerId]: manifest } })),

  removePeerManifest: (peerId) =>
    set((s) => {
      const next = { ...s.peerManifests };
      delete next[peerId];
      return { peerManifests: next };
    }),

  // Saved peer addr actions (for auto-reconnect)
  addSavedPeerAddr: (addr) =>
    set((s) => {
      if (s.savedPeerAddrs.includes(addr)) return s;
      const next = [...s.savedPeerAddrs, addr];
      localStorage.setItem('lab:peerAddrs', JSON.stringify(next));
      return { savedPeerAddrs: next };
    }),

  removeSavedPeerAddr: (addr) =>
    set((s) => {
      const next = s.savedPeerAddrs.filter((a) => a !== addr);
      localStorage.setItem('lab:peerAddrs', JSON.stringify(next));
      return { savedPeerAddrs: next };
    }),

  setSavedPeerAddrs: (addrs) => {
    localStorage.setItem('lab:peerAddrs', JSON.stringify(addrs));
    set({ savedPeerAddrs: addrs });
  },

  // Collab cursor actions
  setRemoteCursor: (peerId, notebookPath, cellId, peerName, x, y) =>
    set((s) => {
      const existing = s.remoteCursors[peerId];
      return {
        remoteCursors: {
          ...s.remoteCursors,
          [peerId]: {
            peerId, notebookPath, cellId, peerName, x, y,
            timestamp: Date.now(),
            visible: existing?.visible ?? true,
          },
        },
        // Also enrich peer name in peers list
        peers: peerName ? s.peers.map((p) =>
          p.id === peerId && !p.name ? { ...p, name: peerName } : p
        ) : s.peers,
      };
    }),

  toggleCursorVisibility: (peerId) =>
    set((s) => {
      const cursor = s.remoteCursors[peerId];
      if (!cursor) return s;
      return {
        remoteCursors: {
          ...s.remoteCursors,
          [peerId]: { ...cursor, visible: !cursor.visible },
        },
      };
    }),

  clearRemoteCursor: (peerId) =>
    set((s) => {
      const next = { ...s.remoteCursors };
      delete next[peerId];
      return { remoteCursors: next };
    }),

  clearStaleCursors: () =>
    set((s) => {
      const now = Date.now();
      const next: Record<string, RemoteCursor> = {};
      for (const [k, v] of Object.entries(s.remoteCursors)) {
        if (now - v.timestamp < 30000) next[k] = v;
      }
      return { remoteCursors: next };
    }),

  // Editor actions
  setAutocompleteEnabled: (enabled) => set({ autocompleteEnabled: enabled }),

  // SOA actions
  setSoaEnabled: (enabled) => set({ soaEnabled: enabled }),

  addSoaRunningService: (service) =>
    set((s) => {
      const idx = s.soaRunningServices.findIndex((svc) => svc.name === service.name);
      if (idx >= 0) {
        const next = [...s.soaRunningServices];
        next[idx] = service;
        return { soaRunningServices: next };
      }
      return { soaRunningServices: [...s.soaRunningServices, service] };
    }),

  removeSoaRunningService: (name) =>
    set((s) => ({ soaRunningServices: s.soaRunningServices.filter((svc) => svc.name !== name) })),

  updateSoaAvailableService: (service) =>
    set((s) => {
      const idx = s.soaAvailableServices.findIndex((svc) => svc.name === service.name && svc.peerId === service.peerId);
      if (idx >= 0) {
        const next = [...s.soaAvailableServices];
        next[idx] = service;
        return { soaAvailableServices: next };
      }
      return { soaAvailableServices: [...s.soaAvailableServices, service] };
    }),

  removeSoaAvailableService: (name, peerId) =>
    set((s) => ({ soaAvailableServices: s.soaAvailableServices.filter((svc) => !(svc.name === name && svc.peerId === peerId)) })),

  clearSoaServices: () => set({ soaRunningServices: [], soaAvailableServices: [], soaEnabled: false }),

  // Helpers
  createNewNotebook: () => {
    const id = uuidv4();
    const nb: OpenNotebook = {
      id,
      filePath: null,
      fileName: 'Sans titre.ipynb',
      data: createEmptyNotebook(),
      dirty: false,
      kernelId: null,
    };
    get().addNotebook(nb);
    return id;
  },

  getActiveNotebook: () => {
    const { notebooks, activeNotebookId } = get();
    return notebooks.find((n) => n.id === activeNotebookId);
  },
}));

// ==========================================
// localStorage auto-save (debounced)
// ==========================================

const LS_KEY = 'lab:session';

/** Strip outputs to keep localStorage small */
function stripOutputs(nb: OpenNotebook): OpenNotebook {
  return {
    ...nb,
    kernelId: null,
    data: {
      ...nb.data,
      cells: nb.data.cells.map((c) => ({
        ...c,
        outputs: [],
        execution_count: null,
      })),
    },
  };
}

const LS_FAVORITES_KEY = 'lab:favorites';

export function saveSessionToLocalStorage() {
  const { notebooks, activeNotebookId } = useStore.getState();
  if (notebooks.length === 0) {
    localStorage.removeItem(LS_KEY);
    return;
  }
  const payload = {
    notebooks: notebooks.map(stripOutputs),
    activeNotebookId,
  };
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
}

function saveFavoritesToLocalStorage() {
  const { favoriteProjects } = useStore.getState();
  localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(favoriteProjects));
  // Also persist to disk via IPC
  window.labAPI?.project?.saveFavorites(favoriteProjects).catch(() => {});
}

export function restoreSessionFromLocalStorage(): boolean {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  try {
    const { notebooks, activeNotebookId } = JSON.parse(raw) as {
      notebooks: OpenNotebook[];
      activeNotebookId: string | null;
    };
    if (!Array.isArray(notebooks) || notebooks.length === 0) return false;
    useStore.setState({ notebooks, activeNotebookId });
    return true;
  } catch {
    return false;
  }
}

export function restoreFavoritesFromLocalStorage(): boolean {
  const raw = localStorage.getItem(LS_FAVORITES_KEY);
  if (!raw) return false;
  try {
    const favorites = JSON.parse(raw) as FavoriteProject[];
    if (!Array.isArray(favorites) || favorites.length === 0) return false;
    useStore.setState({ favoriteProjects: favorites });
    return true;
  } catch {
    return false;
  }
}

export function clearSession() {
  localStorage.removeItem(LS_KEY);
}

// Debounced auto-save: subscribe to store changes
let saveTimer: ReturnType<typeof setTimeout> | null = null;

useStore.subscribe((state, prev) => {
  // Persist notebooks
  if (state.notebooks !== prev.notebooks || state.activeNotebookId !== prev.activeNotebookId) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSessionToLocalStorage, 500);
  }
  // Persist favorites
  if (state.favoriteProjects !== prev.favoriteProjects) {
    saveFavoritesToLocalStorage();
  }
});
