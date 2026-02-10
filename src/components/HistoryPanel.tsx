import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { Undo2, Redo2, X, GitBranch, Edit3, Plus, Trash2, ArrowUpDown, Type, Copy } from 'lucide-react';
import { useHistoryStore } from '../store/useHistoryStore';
import { restoreSnapshot } from '../services/historyCapture';
import { setCellClipboard } from '../services/cellClipboard';
import type { HistoryNode, HistoryAction, NotebookHistory } from '../services/historyTypes';

interface Props {
  notebookId: string;
}

const NODE_W = 120;
const NODE_H = 48;
const GAP_X = 24;
const GAP_Y = 56;
const PADDING = 20;

function actionLabel(action: HistoryAction, cells?: { id: string }[]): string {
  switch (action.type) {
    case 'init':
      return 'Init';
    case 'cell-update': {
      const idx = cells?.findIndex((c) => c.id === action.cellId);
      return idx != null && idx >= 0 ? `Cell ${idx + 1} edit` : 'Cell edit';
    }
    case 'cell-add':
      return `+ ${action.cellType}`;
    case 'cell-delete':
      return 'Cell suppr.';
    case 'cell-move':
      return action.direction === 'up' ? 'Move up' : 'Move down';
    case 'cell-type-change':
      return 'Type chg.';
  }
}

function ActionIcon({ action }: { action: HistoryAction }) {
  switch (action.type) {
    case 'init':
      return <GitBranch className="w-3 h-3" />;
    case 'cell-update':
      return <Edit3 className="w-3 h-3" />;
    case 'cell-add':
      return <Plus className="w-3 h-3" />;
    case 'cell-delete':
      return <Trash2 className="w-3 h-3" />;
    case 'cell-move':
      return <ArrowUpDown className="w-3 h-3" />;
    case 'cell-type-change':
      return <Type className="w-3 h-3" />;
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

/** Compute tree layout positions (top-down, centered) */
function computeLayout(history: NotebookHistory): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  // Calculate subtree width for each node (bottom-up)
  const subtreeWidth: Record<string, number> = {};
  function calcWidth(nodeId: string): number {
    const node = history.nodes[nodeId];
    if (!node || node.children.length === 0) {
      subtreeWidth[nodeId] = NODE_W;
      return NODE_W;
    }
    const childWidths = node.children.map((cid) => calcWidth(cid));
    const total = childWidths.reduce((sum, w) => sum + w, 0) + GAP_X * (node.children.length - 1);
    subtreeWidth[nodeId] = Math.max(NODE_W, total);
    return subtreeWidth[nodeId];
  }
  calcWidth(history.rootId);

  // Assign positions (top-down)
  function layout(nodeId: string, x: number, depth: number) {
    const node = history.nodes[nodeId];
    if (!node) return;

    const w = subtreeWidth[nodeId] ?? NODE_W;
    positions[nodeId] = { x: x + (w - NODE_W) / 2, y: PADDING + depth * (NODE_H + GAP_Y) };

    if (node.children.length === 0) return;

    const childWidths = node.children.map((cid) => subtreeWidth[cid] ?? NODE_W);
    const totalChildW = childWidths.reduce((sum, cw) => sum + cw, 0) + GAP_X * (node.children.length - 1);
    let cx = x + (w - totalChildW) / 2;
    for (let i = 0; i < node.children.length; i++) {
      layout(node.children[i], cx, depth + 1);
      cx += childWidths[i] + GAP_X;
    }
  }
  layout(history.rootId, PADDING, 0);

  return positions;
}

export function HistoryPanel({ notebookId }: Props) {
  const history = useHistoryStore((s) => s.histories[notebookId]);
  const togglePanel = useHistoryStore((s) => s.togglePanel);
  const panelWidth = useHistoryStore((s) => s.panelWidth);
  const setPanelWidth = useHistoryStore((s) => s.setPanelWidth);

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);

  // Resize state
  const [resizing, setResizing] = useState(false);
  const resizeStart = useRef({ x: 0, w: 0 });

  // Recompute layout when history changes (only add new nodes)
  const layoutVersion = useMemo(() => {
    if (!history) return 0;
    return Object.keys(history.nodes).length;
  }, [history]);

  useEffect(() => {
    if (!history) return;
    const computed = computeLayout(history);
    setPositions((prev) => {
      const merged = { ...computed };
      // Keep positions of already-placed nodes
      for (const id of Object.keys(prev)) {
        if (merged[id] && prev[id]) {
          merged[id] = prev[id];
        }
      }
      // New nodes get computed positions
      for (const id of Object.keys(computed)) {
        if (!prev[id]) {
          merged[id] = computed[id];
        }
      }
      return merged;
    });
  }, [layoutVersion, history]);

  // Active path for edge coloring
  const activePath = useMemo(() => {
    if (!history) return new Set<string>();
    const set = new Set<string>();
    let walk: string | null = history.currentNodeId;
    while (walk) {
      set.add(walk);
      walk = history.nodes[walk]?.parentId ?? null;
    }
    return set;
  }, [history]);

  const handleUndo = useCallback(() => {
    const cells = useHistoryStore.getState().undo(notebookId);
    if (cells) restoreSnapshot(notebookId, cells);
  }, [notebookId]);

  const handleRedo = useCallback(() => {
    const cells = useHistoryStore.getState().redo(notebookId);
    if (cells) restoreSnapshot(notebookId, cells);
  }, [notebookId]);

  const handleGoTo = useCallback(
    (nodeId: string) => {
      if (dragId) return; // Don't navigate during drag
      const cells = useHistoryStore.getState().goToNode(notebookId, nodeId);
      if (cells) restoreSnapshot(notebookId, cells);
    },
    [notebookId, dragId],
  );

  // Node drag handlers
  const handleNodePointerDown = useCallback(
    (nodeId: string, e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const pos = positions[nodeId];
      if (!pos) return;
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
      setDragId(nodeId);
    },
    [positions],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (resizing) {
        const delta = resizeStart.current.x - e.clientX;
        setPanelWidth(resizeStart.current.w + delta);
        return;
      }
      if (!dragId) return;
      setPositions((prev) => ({
        ...prev,
        [dragId]: {
          x: Math.max(0, e.clientX - dragOffset.current.x),
          y: Math.max(0, e.clientY - dragOffset.current.y),
        },
      }));
    },
    [dragId, resizing, setPanelWidth],
  );

  const handlePointerUp = useCallback(() => {
    setDragId(null);
    setResizing(false);
  }, []);

  // Resize handle
  const handleResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      resizeStart.current = { x: e.clientX, w: panelWidth };
      setResizing(true);
    },
    [panelWidth],
  );

  // Compute graph bounds
  const posValues = Object.values(positions);
  const graphWidth = posValues.length > 0
    ? Math.max(...posValues.map((p) => p.x)) + NODE_W + PADDING * 2
    : 200;
  const graphHeight = posValues.length > 0
    ? Math.max(...posValues.map((p) => p.y)) + NODE_H + PADDING * 2
    : 200;

  if (!history) {
    return (
      <div style={{ width: panelWidth }} className="shrink-0 border-l border-slate-700/50 bg-slate-900/60 flex items-center justify-center">
        <span className="text-xs text-slate-600">Pas d'historique</span>
      </div>
    );
  }

  const currentNode = history.nodes[history.currentNodeId];
  const canUndo = !!currentNode?.parentId;
  const canRedo = (currentNode?.children.length ?? 0) > 0;
  const redoBranches = currentNode?.children.length ?? 0;
  const branchCount = Object.values(history.nodes).filter((n) => n.children.length > 1).length;
  const allNodes = Object.values(history.nodes);

  // Build edges
  const edges: { parentId: string; childId: string }[] = [];
  for (const node of allNodes) {
    for (const childId of node.children) {
      edges.push({ parentId: node.id, childId });
    }
  }

  return (
    <div
      style={{ width: panelWidth }}
      className="shrink-0 border-l border-slate-700/50 bg-slate-900/60 flex flex-col h-full relative select-none"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Resize handle */}
      <div
        onPointerDown={handleResizeDown}
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-indigo-500/30 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-700/50 shrink-0">
        <GitBranch className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-medium text-slate-300 flex-1">Historique</span>
        {branchCount > 0 && (
          <span className="text-[10px] text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
            {branchCount} br.
          </span>
        )}
        <button onClick={togglePanel} className="p-1 rounded text-slate-600 hover:text-slate-400">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-700/30 shrink-0">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-30"
          title="Undo (Ctrl+Alt+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 disabled:opacity-30"
          title="Redo (Ctrl+Alt+Shift+Z)"
        >
          <Redo2 className="w-3.5 h-3.5" />
          {redoBranches > 1 && (
            <span className="text-[9px] text-violet-400 bg-violet-500/10 px-1 rounded">{redoBranches}</span>
          )}
        </button>
        <span className="ml-auto text-[10px] text-slate-600">{allNodes.length}</span>
      </div>

      {/* Graph area (scrollable both axes) */}
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        <div style={{ width: Math.max(graphWidth, 200), height: Math.max(graphHeight, 200), position: 'relative' }}>
          {/* SVG edges */}
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: graphWidth, height: graphHeight, pointerEvents: 'none' }}
          >
            {edges.map(({ parentId, childId }) => {
              const p = positions[parentId];
              const c = positions[childId];
              if (!p || !c) return null;
              const x1 = p.x + NODE_W / 2;
              const y1 = p.y + NODE_H;
              const x2 = c.x + NODE_W / 2;
              const y2 = c.y;
              const cy1 = y1 + (y2 - y1) * 0.4;
              const cy2 = y2 - (y2 - y1) * 0.4;

              const isActive = activePath.has(parentId) && activePath.has(childId);
              return (
                <path
                  key={`${parentId}-${childId}`}
                  d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={isActive ? '#34d399' : '#334155'}
                  strokeWidth={isActive ? 2 : 1.5}
                  opacity={isActive ? 0.8 : 0.4}
                />
              );
            })}
          </svg>

          {/* Nodes */}
          {allNodes.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;
            const isCurrent = node.id === history.currentNodeId;
            const isRemote = !!node.peerId;
            const isDragging = dragId === node.id;

            return (
              <div
                key={node.id}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: NODE_W,
                  height: NODE_H,
                  cursor: isDragging ? 'grabbing' : 'grab',
                  zIndex: isDragging ? 10 : 1,
                }}
                className={`
                  group/node rounded-lg border text-[10px] px-2 py-1.5 transition-shadow
                  ${isCurrent
                    ? 'bg-emerald-950/60 border-emerald-500/50 shadow-[0_0_8px_rgba(52,211,153,0.15)]'
                    : isRemote
                      ? 'bg-violet-950/40 border-violet-500/30 hover:border-violet-500/50'
                      : 'bg-slate-800/60 border-slate-700/40 hover:border-slate-600/60'
                  }
                `}
                onPointerDown={(e) => handleNodePointerDown(node.id, e)}
                onClick={() => handleGoTo(node.id)}
              >
                {/* Icon + label */}
                <div className="flex items-center gap-1 overflow-hidden">
                  <span className={`shrink-0 ${isCurrent ? 'text-emerald-400' : isRemote ? 'text-violet-400' : 'text-slate-500'}`}>
                    <ActionIcon action={node.action} />
                  </span>
                  <span className={`truncate leading-tight ${isCurrent ? 'text-emerald-300 font-medium' : 'text-slate-400'}`}>
                    {actionLabel(node.action, node.cells)}
                  </span>
                  {node.children.length > 1 && (
                    <span className="shrink-0 text-[8px] text-violet-400 bg-violet-500/10 px-0.5 rounded">
                      {node.children.length}
                    </span>
                  )}
                </div>
                {/* Meta */}
                <div className="flex items-center gap-1 mt-0.5 text-[9px]">
                  <span className="text-slate-600">{timeAgo(node.timestamp)}</span>
                  {node.peerName && <span className="text-violet-400/70 truncate">{node.peerName}</span>}
                </div>
                {/* Current indicator dot */}
                {isCurrent && (
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-900 animate-pulse" />
                )}
                {/* Copy cells button */}
                {node.cells.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCellClipboard(node.cells.map((snap) => ({
                        cell_type: snap.cell_type,
                        source: snap.source,
                        outputs: [],
                        metadata: {},
                      })));
                    }}
                    className="absolute -bottom-1 -right-1 p-0.5 rounded bg-slate-900 border border-slate-700/50 opacity-0 group-hover/node:opacity-100 text-slate-500 hover:text-cyan-400 transition-opacity"
                    title="Copier les cellules"
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
