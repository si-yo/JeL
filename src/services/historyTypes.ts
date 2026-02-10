/**
 * Types for the tree-based undo/redo history system.
 * Each notebook has its own history tree where nodes store cell snapshots.
 * Branching happens when editing after an undo.
 */

export interface CellSnapshot {
  id: string;
  cell_type: 'code' | 'markdown';
  source: string;
  execution_count: number | null;
}

export interface HistoryNode {
  id: string;
  parentId: string | null;
  children: string[];
  timestamp: number;
  action: HistoryAction;
  cells: CellSnapshot[];
  peerId?: string;
  peerName?: string;
}

export type HistoryAction =
  | { type: 'init' }
  | { type: 'cell-update'; cellId: string }
  | { type: 'cell-add'; cellId: string; cellType: 'code' | 'markdown' }
  | { type: 'cell-delete'; cellId: string }
  | { type: 'cell-move'; cellId: string; direction: 'up' | 'down' }
  | { type: 'cell-type-change'; cellId: string };

export interface NotebookHistory {
  rootId: string;
  currentNodeId: string;
  nodes: Record<string, HistoryNode>;
  branchPreferences: Record<string, string>; // parentId → preferred childId for redo
}
