/**
 * History Capture — subscribes to the main store and pushes
 * history nodes whenever cell mutations are detected.
 *
 * Uses debouncing for source edits (500ms) to avoid a node per keystroke.
 * Skips capture when _isHistoryRestore is true (undo/redo in progress).
 *
 * For shared notebooks, also broadcasts new local history nodes to peers.
 */
import { useStore, isRemoteUpdate, isHistoryRestore, setHistoryRestore } from '../store/useStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { getCurrentRemotePeer, broadcastHistoryPush, getOwnPeerId } from './collabBridge';
import type { CellSnapshot, HistoryAction } from './historyTypes';
import type { Cell, OpenNotebook } from '../types';

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function snapshotCells(cells: Cell[]): CellSnapshot[] {
  return cells.map((c) => ({
    id: c.id,
    cell_type: c.cell_type,
    source: c.source,
    execution_count: c.execution_count,
  }));
}

/**
 * Returns the relative notebook path if it's shared and collab is enabled, null otherwise.
 */
function getSharedNotebookPath(nb: OpenNotebook): string | null {
  const { sharedNotebooks, currentProject, collabEnabled } = useStore.getState();
  if (!collabEnabled) return null;

  const nbPath = nb.filePath || nb.fileName;
  const isRemoteNb = !nb.filePath && nb.fileName.startsWith('[');

  if (!isRemoteNb && !sharedNotebooks.includes(nbPath)) return null;

  if (isRemoteNb) {
    const match = nb.fileName.match(/^\[.*?\]\s*(.+)$/);
    return match ? match[1] : nb.fileName;
  }
  if (nb.filePath && currentProject && nb.filePath.startsWith(currentProject.path + '/')) {
    return nb.filePath.replace(currentProject.path + '/', '');
  }
  // Fallback: filename only (never leak absolute paths)
  return nbPath.includes('/') ? nbPath.split('/').pop()! : nbPath;
}

/**
 * Push a history node and optionally broadcast it to peers.
 */
function pushAndBroadcast(
  nbId: string,
  notebookPath: string | null,
  action: HistoryAction,
  cells: CellSnapshot[],
  peerId?: string,
  peerName?: string,
): void {
  useHistoryStore.getState().pushNode(nbId, action, cells, peerId, peerName);

  // Broadcast to peers if this is a local edit on a shared notebook
  if (notebookPath && !isRemoteUpdate()) {
    const history = useHistoryStore.getState().histories[nbId];
    if (history) {
      const node = history.nodes[history.currentNodeId];
      if (node) {
        broadcastHistoryPush(notebookPath, {
          nodeId: node.id,
          parentNodeId: node.parentId,
          action: node.action,
          cells: node.cells,
          peerId: getOwnPeerId() || '',
          peerName: useStore.getState().collabPseudo || undefined,
          timestamp: node.timestamp,
        });
      }
    }
  }
}

/**
 * Flush all pending debounced captures for a notebook.
 * Call this before undo so that any in-progress text edits are committed first.
 */
export function flushPendingCapture(notebookId: string): void {
  for (const [key, timer] of debounceTimers.entries()) {
    if (key.startsWith(notebookId + ':')) {
      clearTimeout(timer);
      debounceTimers.delete(key);
      if (isHistoryRestore()) continue;
      const cellId = key.split(':')[1];
      const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
      if (nb) {
        const cells = snapshotCells(nb.data.cells);
        const notebookPath = getSharedNotebookPath(nb);
        pushAndBroadcast(notebookId, notebookPath, { type: 'cell-update', cellId }, cells);
      }
    }
  }
}

export function startCapture(): () => void {
  const unsub = useStore.subscribe((state, prev) => {
    if (isHistoryRestore()) return;

    const remote = isRemoteUpdate();
    const remotePeer = remote ? getCurrentRemotePeer() : null;

    for (const nb of state.notebooks) {
      const prevNb = prev.notebooks.find((n) => n.id === nb.id);
      if (!prevNb) continue;

      const cells = nb.data.cells;
      const prevCells = prevNb.data.cells;
      if (cells === prevCells) continue;

      // Ensure history is initialized for this notebook
      if (!useHistoryStore.getState().histories[nb.id]) {
        useHistoryStore.getState().initHistory(nb.id, snapshotCells(prevCells));
      }

      const peerId = remotePeer?.peerId;
      const peerName = remotePeer?.peerName;
      const notebookPath = remote ? null : getSharedNotebookPath(nb);

      // Detect source changes (debounced)
      for (const cell of cells) {
        const prevCell = prevCells.find((c) => c.id === cell.id);
        if (prevCell && prevCell.source !== cell.source) {
          const key = `${nb.id}:${cell.id}`;
          const existing = debounceTimers.get(key);
          if (existing) clearTimeout(existing);
          debounceTimers.set(
            key,
            setTimeout(() => {
              debounceTimers.delete(key);
              if (isHistoryRestore()) return;
              const latestCells = snapshotCells(useStore.getState().notebooks.find((n) => n.id === nb.id)?.data.cells ?? cells);
              // Re-check shared path at broadcast time (may have changed)
              const broadcastPath = isRemoteUpdate() ? null : getSharedNotebookPath(nb);
              pushAndBroadcast(
                nb.id,
                broadcastPath,
                { type: 'cell-update', cellId: cell.id },
                latestCells,
                peerId,
                peerName,
              );
            }, 500),
          );
        }
      }

      // Detect cell additions (immediate)
      const prevIds = new Set(prevCells.map((c) => c.id));
      for (const cell of cells) {
        if (!prevIds.has(cell.id)) {
          pushAndBroadcast(
            nb.id,
            notebookPath,
            { type: 'cell-add', cellId: cell.id, cellType: cell.cell_type },
            snapshotCells(cells),
            peerId,
            peerName,
          );
        }
      }

      // Detect cell deletions (immediate)
      const curIds = new Set(cells.map((c) => c.id));
      for (const prevCell of prevCells) {
        if (!curIds.has(prevCell.id)) {
          pushAndBroadcast(
            nb.id,
            notebookPath,
            { type: 'cell-delete', cellId: prevCell.id },
            snapshotCells(cells),
            peerId,
            peerName,
          );
        }
      }

      // Detect cell type changes (immediate)
      for (const cell of cells) {
        const prevCell = prevCells.find((c) => c.id === cell.id);
        if (prevCell && prevCell.cell_type !== cell.cell_type) {
          pushAndBroadcast(
            nb.id,
            notebookPath,
            { type: 'cell-type-change', cellId: cell.id },
            snapshotCells(cells),
            peerId,
            peerName,
          );
        }
      }

      // Detect cell moves (same IDs, different order, same length)
      if (cells.length === prevCells.length && cells.length > 0) {
        const idsMatch = cells.every((c, i) => prevCells[i] && c.id !== prevCells[i].id);
        // More precise: check if ids are the same set but different order
        if (!idsMatch) {
          const curOrder = cells.map((c) => c.id).join(',');
          const prevOrder = prevCells.map((c) => c.id).join(',');
          if (curOrder !== prevOrder && curIds.size === prevIds.size && [...curIds].every((id) => prevIds.has(id))) {
            // Find which cell moved
            for (let i = 0; i < cells.length; i++) {
              if (cells[i].id !== prevCells[i].id) {
                const movedId = cells[i].id;
                const prevIdx = prevCells.findIndex((c) => c.id === movedId);
                const direction = i < prevIdx ? 'up' : 'down';
                pushAndBroadcast(
                  nb.id,
                  notebookPath,
                  { type: 'cell-move', cellId: movedId, direction: direction as 'up' | 'down' },
                  snapshotCells(cells),
                  peerId,
                  peerName,
                );
                break;
              }
            }
          }
        }
      }
    }
  });

  return () => {
    unsub();
    for (const timer of debounceTimers.values()) clearTimeout(timer);
    debounceTimers.clear();
  };
}

/**
 * Restore a snapshot into the main store.
 * Preserves outputs for cells that still exist.
 */
export function restoreSnapshot(notebookId: string, cells: CellSnapshot[]): void {
  setHistoryRestore(true);

  const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
  if (!nb) {
    setHistoryRestore(false);
    return;
  }

  // Build a map of existing cells to preserve outputs
  const existingByIds = new Map(nb.data.cells.map((c) => [c.id, c]));

  const rebuilt: Cell[] = cells.map((snap) => {
    const existing = existingByIds.get(snap.id);
    return {
      id: snap.id,
      cell_type: snap.cell_type,
      source: snap.source,
      execution_count: snap.execution_count,
      outputs: existing?.outputs ?? [],
      metadata: existing?.metadata ?? {},
    };
  });

  useStore.getState().updateNotebookCells(notebookId, rebuilt);
  setHistoryRestore(false);
}
