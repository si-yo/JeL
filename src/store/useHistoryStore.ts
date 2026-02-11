import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { CellSnapshot, HistoryNode, HistoryAction, NotebookHistory } from '../services/historyTypes';

export interface RedoBranchOption {
  nodeId: string;
  action: HistoryAction;
  timestamp: number;
  peerId?: string;
  peerName?: string;
  cells: CellSnapshot[];
}

interface HistoryStore {
  histories: Record<string, NotebookHistory>;
  panelOpen: boolean;
  panelWidth: number;
  pendingRedoBranches: { notebookId: string; options: RedoBranchOption[] } | null;

  initHistory: (notebookId: string, cells: CellSnapshot[]) => void;
  pushNode: (notebookId: string, action: HistoryAction, cells: CellSnapshot[], peerId?: string, peerName?: string) => void;
  undo: (notebookId: string) => CellSnapshot[] | null;
  redo: (notebookId: string) => CellSnapshot[] | null;
  goToNode: (notebookId: string, nodeId: string) => CellSnapshot[] | null;
  togglePanel: () => void;
  setPanelWidth: (w: number) => void;
  pruneOldNodes: (notebookId: string, maxNodes?: number) => void;
  removeHistory: (notebookId: string) => void;
  setPendingRedoBranches: (data: { notebookId: string; options: RedoBranchOption[] } | null) => void;
  getRedoChildren: (notebookId: string) => RedoBranchOption[];
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  histories: {},
  panelOpen: false,
  panelWidth: 360,
  pendingRedoBranches: null,

  initHistory: (notebookId, cells) => {
    if (get().histories[notebookId]) return;
    const rootId = uuidv4();
    const root: HistoryNode = {
      id: rootId,
      parentId: null,
      children: [],
      timestamp: Date.now(),
      action: { type: 'init' },
      cells,
    };
    set((s) => ({
      histories: {
        ...s.histories,
        [notebookId]: {
          rootId,
          currentNodeId: rootId,
          nodes: { [rootId]: root },
          branchPreferences: {},
        },
      },
    }));
  },

  pushNode: (notebookId, action, cells, peerId, peerName) => {
    const history = get().histories[notebookId];
    if (!history) return;

    const nodeId = uuidv4();
    const node: HistoryNode = {
      id: nodeId,
      parentId: history.currentNodeId,
      children: [],
      timestamp: Date.now(),
      action,
      cells,
      peerId,
      peerName,
    };

    const parentNode = history.nodes[history.currentNodeId];
    if (!parentNode) return;

    const updatedParent: HistoryNode = {
      ...parentNode,
      children: [...parentNode.children, nodeId],
    };

    set((s) => ({
      histories: {
        ...s.histories,
        [notebookId]: {
          ...history,
          currentNodeId: nodeId,
          nodes: {
            ...history.nodes,
            [parentNode.id]: updatedParent,
            [nodeId]: node,
          },
          branchPreferences: {
            ...history.branchPreferences,
            [parentNode.id]: nodeId,
          },
        },
      },
    }));

    // Auto-prune if too many nodes
    if (Object.keys(get().histories[notebookId]?.nodes ?? {}).length > 200) {
      get().pruneOldNodes(notebookId);
    }
  },

  undo: (notebookId) => {
    const history = get().histories[notebookId];
    if (!history) return null;

    const current = history.nodes[history.currentNodeId];
    if (!current || !current.parentId) return null;

    const parent = history.nodes[current.parentId];
    if (!parent) return null;

    set((s) => ({
      histories: {
        ...s.histories,
        [notebookId]: {
          ...history,
          currentNodeId: parent.id,
          branchPreferences: {
            ...history.branchPreferences,
            [parent.id]: current.id,
          },
        },
      },
    }));

    return parent.cells;
  },

  redo: (notebookId) => {
    const history = get().histories[notebookId];
    if (!history) return null;

    const current = history.nodes[history.currentNodeId];
    if (!current || current.children.length === 0) return null;

    // Use preferred branch, or fall back to the last child
    const preferred = history.branchPreferences[current.id];
    const childId = preferred && current.children.includes(preferred)
      ? preferred
      : current.children[current.children.length - 1];

    const child = history.nodes[childId];
    if (!child) return null;

    set((s) => ({
      histories: {
        ...s.histories,
        [notebookId]: {
          ...history,
          currentNodeId: child.id,
        },
      },
    }));

    return child.cells;
  },

  goToNode: (notebookId, nodeId) => {
    const history = get().histories[notebookId];
    if (!history || !history.nodes[nodeId]) return null;

    // Update branch preferences along the path from root to target
    const updatedPrefs = { ...history.branchPreferences };
    let node = history.nodes[nodeId];
    while (node.parentId) {
      updatedPrefs[node.parentId] = node.id;
      node = history.nodes[node.parentId];
      if (!node) break;
    }

    set((s) => ({
      histories: {
        ...s.histories,
        [notebookId]: {
          ...history,
          currentNodeId: nodeId,
          branchPreferences: updatedPrefs,
        },
      },
    }));

    return history.nodes[nodeId].cells;
  },

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setPanelWidth: (w) => set({ panelWidth: Math.max(280, Math.min(600, w)) }),

  pruneOldNodes: (notebookId, maxNodes = 200) => {
    const history = get().histories[notebookId];
    if (!history) return;

    const nodeCount = Object.keys(history.nodes).length;
    if (nodeCount <= maxNodes) return;

    // Find all nodes on the path from root to current (these are protected)
    const protectedIds = new Set<string>();
    let walk: string | null = history.currentNodeId;
    while (walk) {
      protectedIds.add(walk);
      walk = history.nodes[walk]?.parentId ?? null;
    }

    // Collect all nodes sorted by timestamp (oldest first)
    const allNodes = Object.values(history.nodes).sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = new Set<string>();

    for (const n of allNodes) {
      if (nodeCount - toRemove.size <= maxNodes) break;
      if (protectedIds.has(n.id)) continue;
      // Only remove leaf nodes (no children, or children already removed)
      const hasLiveChildren = n.children.some((cid) => !toRemove.has(cid));
      if (!hasLiveChildren) {
        toRemove.add(n.id);
      }
    }

    if (toRemove.size === 0) return;

    const updatedNodes = { ...history.nodes };
    const updatedPrefs = { ...history.branchPreferences };
    for (const id of toRemove) {
      const removed = updatedNodes[id];
      if (removed?.parentId && updatedNodes[removed.parentId]) {
        updatedNodes[removed.parentId] = {
          ...updatedNodes[removed.parentId],
          children: updatedNodes[removed.parentId].children.filter((c) => c !== id),
        };
      }
      delete updatedNodes[id];
      delete updatedPrefs[id];
    }

    set((s) => ({
      histories: {
        ...s.histories,
        [notebookId]: {
          ...history,
          nodes: updatedNodes,
          branchPreferences: updatedPrefs,
        },
      },
    }));
  },

  removeHistory: (notebookId) => {
    set((s) => {
      const { [notebookId]: _, ...rest } = s.histories;
      return { histories: rest };
    });
  },

  setPendingRedoBranches: (data) => set({ pendingRedoBranches: data }),

  getRedoChildren: (notebookId) => {
    const history = get().histories[notebookId];
    if (!history) return [];
    const current = history.nodes[history.currentNodeId];
    if (!current || current.children.length === 0) return [];
    return current.children
      .map((childId) => {
        const child = history.nodes[childId];
        if (!child) return null;
        return {
          nodeId: child.id,
          action: child.action,
          timestamp: child.timestamp,
          peerId: child.peerId,
          peerName: child.peerName,
          cells: child.cells,
        };
      })
      .filter((x): x is RedoBranchOption => x !== null);
  },
}));

// ==========================================
// localStorage persistence (debounced)
// ==========================================

const LS_HISTORY_KEY = 'lab:history';
const MAX_PERSISTED_NODES = 100;

/**
 * Prune a history tree to keep only the most relevant nodes for persistence.
 * Keeps: the path from root to current, plus recent branches (up to MAX_PERSISTED_NODES).
 */
function pruneForPersistence(history: NotebookHistory): NotebookHistory {
  const nodeCount = Object.keys(history.nodes).length;
  if (nodeCount <= MAX_PERSISTED_NODES) return history;

  // Protect the path from root → current
  const protectedIds = new Set<string>();
  let walk: string | null = history.currentNodeId;
  while (walk) {
    protectedIds.add(walk);
    walk = history.nodes[walk]?.parentId ?? null;
  }

  // Sort non-protected by timestamp desc, keep the newest ones
  const nonProtected = Object.values(history.nodes)
    .filter((n) => !protectedIds.has(n.id))
    .sort((a, b) => b.timestamp - a.timestamp);

  const budget = MAX_PERSISTED_NODES - protectedIds.size;
  const keepExtra = new Set(nonProtected.slice(0, Math.max(0, budget)).map((n) => n.id));
  const keepAll = new Set([...protectedIds, ...keepExtra]);

  const prunedNodes: Record<string, HistoryNode> = {};
  for (const [id, node] of Object.entries(history.nodes)) {
    if (!keepAll.has(id)) continue;
    prunedNodes[id] = {
      ...node,
      children: node.children.filter((cid) => keepAll.has(cid)),
    };
  }

  const prunedPrefs: Record<string, string> = {};
  for (const [parentId, childId] of Object.entries(history.branchPreferences)) {
    if (keepAll.has(parentId) && keepAll.has(childId)) {
      prunedPrefs[parentId] = childId;
    }
  }

  return {
    rootId: history.rootId,
    currentNodeId: history.currentNodeId,
    nodes: prunedNodes,
    branchPreferences: prunedPrefs,
  };
}

export function saveHistoryToLocalStorage(): void {
  const { histories } = useHistoryStore.getState();
  const nbIds = Object.keys(histories);
  if (nbIds.length === 0) {
    localStorage.removeItem(LS_HISTORY_KEY);
    return;
  }
  const pruned: Record<string, NotebookHistory> = {};
  for (const [nbId, history] of Object.entries(histories)) {
    pruned[nbId] = pruneForPersistence(history);
  }
  try {
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(pruned));
  } catch {
    // localStorage full — silently skip
  }
}

export function restoreHistoryFromLocalStorage(): boolean {
  const raw = localStorage.getItem(LS_HISTORY_KEY);
  if (!raw) return false;
  try {
    const histories = JSON.parse(raw) as Record<string, NotebookHistory>;
    if (!histories || typeof histories !== 'object') return false;

    // Validate each history has required fields
    for (const nbId of Object.keys(histories)) {
      const h = histories[nbId];
      if (!h.rootId || !h.currentNodeId || !h.nodes || !h.nodes[h.rootId]) {
        delete histories[nbId];
        continue;
      }
      // Ensure currentNodeId still exists (may have been pruned)
      if (!h.nodes[h.currentNodeId]) {
        h.currentNodeId = h.rootId;
      }
    }

    if (Object.keys(histories).length === 0) return false;
    useHistoryStore.setState({ histories });
    return true;
  } catch {
    return false;
  }
}

// Debounced auto-save: subscribe to history changes
let historySaveTimer: ReturnType<typeof setTimeout> | null = null;

useHistoryStore.subscribe((state, prev) => {
  if (state.histories !== prev.histories) {
    if (historySaveTimer) clearTimeout(historySaveTimer);
    historySaveTimer = setTimeout(saveHistoryToLocalStorage, 1000);
  }
});
