import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { CellSnapshot, HistoryNode, HistoryAction, NotebookHistory } from '../services/historyTypes';

interface HistoryStore {
  histories: Record<string, NotebookHistory>;
  panelOpen: boolean;
  panelWidth: number;

  initHistory: (notebookId: string, cells: CellSnapshot[]) => void;
  pushNode: (notebookId: string, action: HistoryAction, cells: CellSnapshot[], peerId?: string, peerName?: string) => void;
  undo: (notebookId: string) => CellSnapshot[] | null;
  redo: (notebookId: string) => CellSnapshot[] | null;
  goToNode: (notebookId: string, nodeId: string) => CellSnapshot[] | null;
  togglePanel: () => void;
  setPanelWidth: (w: number) => void;
  pruneOldNodes: (notebookId: string, maxNodes?: number) => void;
  removeHistory: (notebookId: string) => void;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  histories: {},
  panelOpen: false,
  panelWidth: 360,

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
}));
