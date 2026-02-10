import { useEffect } from 'react';
import { ProjectSidebar } from './components/ProjectSidebar';
import { Notebook } from './components/Notebook';
import { CommandHelper } from './components/CommandHelper';
import { useStore, restoreSessionFromLocalStorage, restoreFavoritesFromLocalStorage, isRemoteUpdate, isHistoryRestore } from './store/useStore';
import { initCollab, destroyCollab, broadcastCellUpdate, broadcastCellAdd, broadcastCellDelete, broadcastCellTypeChange, broadcastCellMove, broadcastNotebookState } from './services/collabBridge';
import { startCapture, restoreSnapshot } from './services/historyCapture';
import { useHistoryStore } from './store/useHistoryStore';

export default function App() {
  const createNewNotebook = useStore((s) => s.createNewNotebook);
  const notebooks = useStore((s) => s.notebooks);

  // Listen for menu events from main process
  useEffect(() => {
    const cleanup = window.labAPI.onMenuEvent(async (event) => {
      switch (event) {
        case 'new-notebook':
          createNewNotebook();
          break;

        case 'open-notebook': {
          const result = await window.labAPI.dialog.openFile();
          if (result.canceled || result.filePaths.length === 0) return;

          const filePath = result.filePaths[0];
          const { parseNotebook } = await import('./utils/notebook');
          const { v4: uuidv4 } = await import('uuid');

          const fileResult = await window.labAPI.fs.readFile(filePath);
          if (!fileResult.success || !fileResult.data) return;

          const data = parseNotebook(fileResult.data);
          const fileName = filePath.split('/').pop() || 'notebook.ipynb';

          useStore.getState().addNotebook({
            id: uuidv4(),
            filePath,
            fileName,
            data,
            dirty: false,
            kernelId: null,
          });
          break;
        }

        case 'save':
          (window as unknown as Record<string, () => void>).__labSave?.();
          break;

        case 'save-as':
          (window as unknown as Record<string, () => void>).__labSaveAs?.();
          break;

        case 'start-jupyter':
          (window as unknown as Record<string, () => void>).__labStartJupyter?.();
          break;

        case 'stop-jupyter':
          await window.labAPI.jupyter.stop();
          useStore.getState().setJupyterRunning(false);
          break;

        case 'restart-kernel':
          (window as unknown as Record<string, () => void>).__labRestartKernel?.();
          break;

        case 'interrupt-kernel':
          (window as unknown as Record<string, () => void>).__labInterruptKernel?.();
          break;

        case 'new-project': {
          const dirResult = await window.labAPI.dialog.openDirectory();
          if (dirResult.canceled || dirResult.filePaths.length === 0) return;
          const dirPath = dirResult.filePaths[0];
          const name = dirPath.split('/').pop() || 'projet';
          const createResult = await window.labAPI.project.create({ name, dirPath });
          if (createResult.success && createResult.project) {
            useStore.getState().setCurrentProject(createResult.project);
            useStore.getState().addFavorite({
              path: dirPath,
              name,
              lastOpened: new Date().toISOString(),
            });
            await window.labAPI.project.saveFavorites(useStore.getState().favoriteProjects);
          }
          break;
        }

        case 'open-project': {
          const dirResult = await window.labAPI.dialog.openDirectory();
          if (dirResult.canceled || dirResult.filePaths.length === 0) return;
          const openResult = await window.labAPI.project.open(dirResult.filePaths[0]);
          if (openResult.success && openResult.project) {
            useStore.getState().setCurrentProject(openResult.project);
            useStore.getState().setJupyterRunning(false); // Jupyter stopped during project switch
            useStore.getState().addFavorite({
              path: openResult.project.path,
              name: openResult.project.name,
              lastOpened: new Date().toISOString(),
            });
            await window.labAPI.project.saveFavorites(useStore.getState().favoriteProjects);
          }
          break;
        }

        case 'close-project':
          await window.labAPI.project.close();
          useStore.getState().setCurrentProject(null);
          useStore.getState().setJupyterRunning(false);
          break;
      }
    });

    return cleanup;
  }, [createNewNotebook]);

  // Listen for jupyter server stop
  useEffect(() => {
    const cleanup = window.labAPI.jupyter.onStopped(() => {
      useStore.getState().setJupyterRunning(false);
    });
    return cleanup;
  }, []);

  // Check initial jupyter status
  useEffect(() => {
    window.labAPI.jupyter.status().then((status) => {
      if (status.running) {
        useStore.getState().setJupyterRunning(true, status.port, status.token);
      }
    });
  }, []);

  // Load favorites on startup (localStorage first, then disk)
  useEffect(() => {
    const restoredLocal = restoreFavoritesFromLocalStorage();
    // Also try disk (IPC) as source of truth
    window.labAPI.project.getFavorites().then((favorites) => {
      if (Array.isArray(favorites) && favorites.length > 0) {
        useStore.getState().setFavoriteProjects(favorites);
      } else if (!restoredLocal) {
        // Neither source had data
      }
    });
  }, []);

  // Check IPFS availability, swarm key, and status on startup
  useEffect(() => {
    window.labAPI.ipfs.available().then(({ available }) => {
      useStore.getState().setIpfsAvailable(available);
      if (available) {
        window.labAPI.ipfs.status().then((status) => {
          if (status.running) {
            useStore.getState().setIpfsRunning(true);
          }
        });
        window.labAPI.ipfs.swarmKeyActive().then((result) => {
          if (result.active && result.name) {
            useStore.getState().setActiveSwarmKey(result.name);
          }
        });
        window.labAPI.ipfs.swarmKeyList().then((keys) => {
          useStore.getState().setSwarmKeys(keys);
        });
      }
    });
  }, []);

  // Auto-init/destroy collab when IPFS starts/stops
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      if (state.ipfsRunning && !prev.ipfsRunning) {
        initCollab().catch(console.error);
      } else if (!state.ipfsRunning && prev.ipfsRunning) {
        destroyCollab().catch(console.error);
      }
    });

    // Also check on mount (IPFS may already be running)
    if (useStore.getState().ipfsRunning) {
      initCollab().catch(console.error);
    }

    return () => {
      unsub();
      destroyCollab().catch(console.error);
    };
  }, []);

  // Broadcast local cell edits to peers via collab
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      if (isRemoteUpdate()) return;
      if (isHistoryRestore()) return;
      if (!state.collabEnabled) return;
      const project = state.currentProject;

      for (const nb of state.notebooks) {
        const prevNb = prev.notebooks.find((n) => n.id === nb.id);
        if (!prevNb) continue;

        const nbPath = nb.filePath || nb.fileName;
        // Remote notebooks (opened from peers) always broadcast back
        const isRemoteNotebook = !nb.filePath && nb.fileName.startsWith('[');
        if (!isRemoteNotebook && !state.sharedNotebooks.includes(nbPath)) continue;

        let notebookPath: string;
        if (isRemoteNotebook) {
          // Extract original filename from "[peerName] filename" format
          const match = nb.fileName.match(/^\[.*?\]\s*(.+)$/);
          notebookPath = match ? match[1] : nb.fileName;
        } else {
          notebookPath = (nb.filePath && project)
            ? nb.filePath.replace(project.path + '/', '')
            : nb.fileName;
        }

        // Cell source changes + cell type changes
        for (const cell of nb.data.cells) {
          const prevCell = prevNb.data.cells.find((c) => c.id === cell.id);
          if (prevCell) {
            if (prevCell.source !== cell.source) {
              broadcastCellUpdate(notebookPath, cell.id, cell.source);
            }
            if (prevCell.cell_type !== cell.cell_type) {
              broadcastCellTypeChange(notebookPath, cell.id, cell.cell_type);
            }
          }
        }

        // Cell additions
        if (nb.data.cells.length > prevNb.data.cells.length) {
          const prevIds = new Set(prevNb.data.cells.map((c) => c.id));
          for (let i = 0; i < nb.data.cells.length; i++) {
            const cell = nb.data.cells[i];
            if (!prevIds.has(cell.id)) {
              broadcastCellAdd(notebookPath, cell.id, cell.cell_type, i - 1);
            }
          }
        }

        // Cell deletions
        if (nb.data.cells.length < prevNb.data.cells.length) {
          const currentIds = new Set(nb.data.cells.map((c) => c.id));
          for (const prevCell of prevNb.data.cells) {
            if (!currentIds.has(prevCell.id)) {
              broadcastCellDelete(notebookPath, prevCell.id);
            }
          }
        }

        // Cell moves (same cells, different order)
        if (nb.data.cells.length === prevNb.data.cells.length && nb.data.cells.length > 0) {
          const curOrder = nb.data.cells.map((c) => c.id).join(',');
          const prevOrder = prevNb.data.cells.map((c) => c.id).join(',');
          if (curOrder !== prevOrder) {
            const curIds = new Set(nb.data.cells.map((c) => c.id));
            const prevIds = new Set(prevNb.data.cells.map((c) => c.id));
            if (curIds.size === prevIds.size && [...curIds].every((id) => prevIds.has(id))) {
              for (let i = 0; i < nb.data.cells.length; i++) {
                if (nb.data.cells[i].id !== prevNb.data.cells[i].id) {
                  const movedId = nb.data.cells[i].id;
                  const prevIdx = prevNb.data.cells.findIndex((c) => c.id === movedId);
                  broadcastCellMove(notebookPath, movedId, i < prevIdx ? 'up' : 'down');
                  break;
                }
              }
            }
          }
        }
      }
    });
    return unsub;
  }, []);

  // Periodically clear stale remote cursors and stale peers
  useEffect(() => {
    const interval = setInterval(() => {
      useStore.getState().clearStaleCursors();
      useStore.getState().cleanStalePeers();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Reactive presence + manifest broadcasts are now centralized in collabBridge.ts
  // (storeUnsub + watchManifestChanges handle pseudo/activeNotebook/sharedNotebooks changes)

  // Check bridge status on startup
  useEffect(() => {
    window.labAPI.bridge.status().then((status) => {
      if (status.running) {
        useStore.getState().setBridgeRunning(true, status.pin, status.ip);
        useStore.getState().setBridgeClients(status.clients);
      }
    });
  }, []);

  // Handle bridge requests from mobile clients
  useEffect(() => {
    const cleanup = window.labAPI.bridge.onRequest((req) => {
      console.log(`[Bridge] << Request action="${req.action}"`, req);
      const state = useStore.getState();
      switch (req.action) {
        case 'list-notebooks': {
          const data = state.notebooks.map((nb) => ({
            id: nb.id,
            fileName: nb.fileName,
            cellCount: nb.data.cells.length,
          }));
          window.labAPI.bridge.respond(req.wsId as number, { event: 'notebooks', data });
          break;
        }
        case 'get-notebook': {
          const nb = state.notebooks.find((n) => n.id === req.notebookId);
          if (nb) {
            window.labAPI.bridge.respond(req.wsId as number, {
              event: 'notebook-data',
              data: { id: nb.id, fileName: nb.fileName, cells: nb.data.cells },
            });
          }
          break;
        }
        case 'create-notebook': {
          state.createNewNotebook();
          const newNb = state.notebooks[state.notebooks.length - 1];
          // Respond with the new notebook and refresh list for all clients
          if (newNb) {
            window.labAPI.bridge.respond(req.wsId as number, {
              event: 'notebook-data',
              data: { id: newNb.id, fileName: newNb.fileName, cells: newNb.data.cells },
            });
            const list = useStore.getState().notebooks.map((nb) => ({
              id: nb.id, fileName: nb.fileName, cellCount: nb.data.cells.length,
            }));
            window.labAPI.bridge.broadcast({ event: 'notebooks', data: list });
          }
          break;
        }
        case 'cell-update': {
          const { notebookId, cellId, source } = req as { notebookId: string; cellId: string; source: string; action: string; wsId: number };
          state.updateCellSource(notebookId, cellId, source);
          // Broadcast change to all mobile clients
          window.labAPI.bridge.broadcast({ event: 'cell-changed', notebookId, cellId, source });
          break;
        }
        case 'run-cell': {
          // Forward to Notebook component via a global event
          const { notebookId, cellId } = req as { notebookId: string; cellId: string; action: string; wsId: number };
          window.dispatchEvent(new CustomEvent('bridge:run-cell', { detail: { notebookId, cellId } }));
          break;
        }
        case 'add-cell': {
          const { notebookId, cellType, afterIndex } = req as { notebookId: string; cellType: 'code' | 'markdown'; afterIndex: number; action: string; wsId: number };
          state.addCell(notebookId, cellType || 'code', afterIndex);
          // Send updated notebook to all clients
          const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
          if (nb) {
            window.labAPI.bridge.broadcast({
              event: 'notebook-data',
              data: { id: nb.id, fileName: nb.fileName, cells: nb.data.cells },
            });
          }
          break;
        }
        case 'delete-cell': {
          const { notebookId, cellId } = req as { notebookId: string; cellId: string; action: string; wsId: number };
          state.deleteCell(notebookId, cellId);
          const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
          if (nb) {
            window.labAPI.bridge.broadcast({
              event: 'notebook-data',
              data: { id: nb.id, fileName: nb.fileName, cells: nb.data.cells },
            });
          }
          break;
        }
        case 'toggle-cell-type': {
          const { notebookId, cellId } = req as { notebookId: string; cellId: string; action: string; wsId: number };
          const nb = state.notebooks.find((n) => n.id === notebookId);
          const cell = nb?.data.cells.find((c) => c.id === cellId);
          if (cell) {
            state.updateCellType(notebookId, cellId, cell.cell_type === 'code' ? 'markdown' : 'code');
            const updated = useStore.getState().notebooks.find((n) => n.id === notebookId);
            if (updated) {
              window.labAPI.bridge.broadcast({
                event: 'notebook-data',
                data: { id: updated.id, fileName: updated.fileName, cells: updated.data.cells },
              });
            }
          }
          break;
        }
        case 'move-cell-up': {
          const { notebookId, cellId } = req as { notebookId: string; cellId: string; action: string; wsId: number };
          state.moveCellUp(notebookId, cellId);
          const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
          if (nb) {
            window.labAPI.bridge.broadcast({
              event: 'notebook-data',
              data: { id: nb.id, fileName: nb.fileName, cells: nb.data.cells },
            });
          }
          break;
        }
        case 'move-cell-down': {
          const { notebookId, cellId } = req as { notebookId: string; cellId: string; action: string; wsId: number };
          state.moveCellDown(notebookId, cellId);
          const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
          if (nb) {
            window.labAPI.bridge.broadcast({
              event: 'notebook-data',
              data: { id: nb.id, fileName: nb.fileName, cells: nb.data.cells },
            });
          }
          break;
        }
        case 'restart-kernel': {
          window.dispatchEvent(new CustomEvent('bridge:restart-kernel', { detail: { notebookId: req.notebookId } }));
          break;
        }
        case 'interrupt-kernel': {
          window.dispatchEvent(new CustomEvent('bridge:interrupt-kernel', { detail: { notebookId: req.notebookId } }));
          break;
        }
        case 'get-collab-status': {
          const { collabEnabled, collabPseudo, peers } = state;
          window.labAPI.bridge.respond(req.wsId as number, {
            event: 'collab-status',
            data: {
              active: collabEnabled,
              peerName: collabPseudo,
              peers: peers.map((p) => ({ id: p.id, name: p.name, status: p.status })),
            },
          });
          break;
        }
        case 'get-history': {
          const notebookId = req.notebookId as string;
          const history = useHistoryStore.getState().histories[notebookId];
          if (history) {
            const lightNodes: Record<string, { id: string; parentId: string | null; children: string[]; timestamp: number; action: unknown; peerId?: string; peerName?: string }> = {};
            for (const [id, node] of Object.entries(history.nodes)) {
              lightNodes[id] = {
                id: node.id, parentId: node.parentId, children: node.children,
                timestamp: node.timestamp, action: node.action,
                peerId: node.peerId, peerName: node.peerName,
              };
            }
            window.labAPI.bridge.respond(req.wsId as number, {
              event: 'history-data',
              data: { notebookId, rootId: history.rootId, currentNodeId: history.currentNodeId, nodes: lightNodes },
            });
          }
          break;
        }
        case 'history-undo': {
          const notebookId = req.notebookId as string;
          const cells = useHistoryStore.getState().undo(notebookId);
          if (cells) {
            restoreSnapshot(notebookId, cells);
            broadcastNotebookState(notebookId, cells, 'undo');
            const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
            if (nb) {
              window.labAPI.bridge.broadcast({ event: 'notebook-data', data: { id: nb.id, fileName: nb.fileName, cells: nb.data.cells } });
            }
            // Send updated history tree
            const history = useHistoryStore.getState().histories[notebookId];
            if (history) {
              window.labAPI.bridge.broadcast({ event: 'history-current', data: { notebookId, currentNodeId: history.currentNodeId } });
            }
          }
          break;
        }
        case 'history-redo': {
          const notebookId = req.notebookId as string;
          const cells = useHistoryStore.getState().redo(notebookId);
          if (cells) {
            restoreSnapshot(notebookId, cells);
            broadcastNotebookState(notebookId, cells, 'redo');
            const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
            if (nb) {
              window.labAPI.bridge.broadcast({ event: 'notebook-data', data: { id: nb.id, fileName: nb.fileName, cells: nb.data.cells } });
            }
            const history = useHistoryStore.getState().histories[notebookId];
            if (history) {
              window.labAPI.bridge.broadcast({ event: 'history-current', data: { notebookId, currentNodeId: history.currentNodeId } });
            }
          }
          break;
        }
        case 'history-goto': {
          const notebookId = req.notebookId as string;
          const nodeId = req.nodeId as string;
          const cells = useHistoryStore.getState().goToNode(notebookId, nodeId);
          if (cells) {
            restoreSnapshot(notebookId, cells);
            broadcastNotebookState(notebookId, cells, 'goto');
            const nb = useStore.getState().notebooks.find((n) => n.id === notebookId);
            if (nb) {
              window.labAPI.bridge.broadcast({ event: 'notebook-data', data: { id: nb.id, fileName: nb.fileName, cells: nb.data.cells } });
            }
            window.labAPI.bridge.broadcast({ event: 'history-current', data: { notebookId, currentNodeId: nodeId } });
          }
          break;
        }
        case 'pip-install': {
          const packages = req.packages as string;
          window.labAPI.pip.install({ packages }).then((result) => {
            window.labAPI.bridge.respond(req.wsId as number, {
              event: 'pip-result',
              data: { success: result.success, output: result.output, error: result.error },
            });
          });
          break;
        }
        case 'pip-list': {
          window.labAPI.pip.list().then((result) => {
            window.labAPI.bridge.respond(req.wsId as number, {
              event: 'pip-list',
              data: result,
            });
          });
          break;
        }
      }
    });
    return cleanup;
  }, []);

  // Start history capture (detects cell mutations and pushes history nodes)
  useEffect(() => {
    const stop = startCapture();
    return stop;
  }, []);

  // Init history for newly opened notebooks
  useEffect(() => {
    for (const nb of notebooks) {
      if (!useHistoryStore.getState().histories[nb.id]) {
        const snapshots = nb.data.cells.map((c) => ({
          id: c.id,
          cell_type: c.cell_type as 'code' | 'markdown',
          source: c.source,
          execution_count: c.execution_count,
        }));
        useHistoryStore.getState().initHistory(nb.id, snapshots);
      }
    }
  }, [notebooks]);

  // Keyboard shortcuts for undo/redo/toggle history panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+Alt+Z = Undo, Ctrl+Alt+Shift+Z = Redo, Ctrl+Alt+H = Toggle panel
      if (!e.ctrlKey && !e.metaKey) return;
      if (!e.altKey) return;

      const activeNbId = useStore.getState().activeNotebookId;
      if (!activeNbId) return;

      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) {
          const cells = useHistoryStore.getState().redo(activeNbId);
          if (cells) {
            restoreSnapshot(activeNbId, cells);
            broadcastNotebookState(activeNbId, cells, 'redo');
          }
        } else {
          const cells = useHistoryStore.getState().undo(activeNbId);
          if (cells) {
            restoreSnapshot(activeNbId, cells);
            broadcastNotebookState(activeNbId, cells, 'undo');
          }
        }
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        useHistoryStore.getState().togglePanel();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Restore session from localStorage, or create initial notebook
  useEffect(() => {
    if (notebooks.length === 0) {
      const restored = restoreSessionFromLocalStorage();
      if (!restored) {
        createNewNotebook();
      }
    }
  }, []);

  return (
    <div className="flex h-full">
      <ProjectSidebar />
      <Notebook />
      <CommandHelper />
    </div>
  );
}
