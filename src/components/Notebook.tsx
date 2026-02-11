import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Cell } from './Cell';
import { Toolbar } from './Toolbar';
import { NotebookLinks } from './NotebookLinks';
import { HistoryPanel } from './HistoryPanel';
import { RemoteCursors } from './RemoteCursors';
import { Plus, GitBranch, EyeOff, List } from 'lucide-react';
import { PipPanel } from './PipPanel';
import { CellPanel } from './CellPanel';
import { SearchOverlay } from './SearchOverlay';
import { ExportPdfDialog } from './ExportPdfDialog';
import { generatePdfHtml, type ExportScope } from '../services/pdfExportService';
import type { KernelState, CellOutput, NotebookLink } from '../types';
import { KernelService } from '../services/kernelService';
import { getCollab, broadcastCursor } from '../services/collabBridge';
import { useHistoryStore } from '../store/useHistoryStore';
import { resolveUse, hasUse, resolveAsk, hasAsk } from '../utils/notebookImport';
import { setCellClipboard, getCellClipboard } from '../services/cellClipboard';
import { createCell } from '../utils/notebook';

// Keep kernel services per notebook
const kernelServices = new Map<string, KernelService>();

export function Notebook() {
  const notebook = useStore((s) => s.getActiveNotebook());
  const jupyterRunning = useStore((s) => s.jupyterRunning);
  const jupyterPort = useStore((s) => s.jupyterPort);
  const jupyterToken = useStore((s) => s.jupyterToken);
  const kernelStates = useStore((s) => s.kernelStates);

  const store = useStore;

  const ipfsRunning = useStore((s) => s.ipfsRunning);
  const peers = useStore((s) => s.peers);
  const currentProject = useStore((s) => s.currentProject);
  const autocompleteEnabled = useStore((s) => s.autocompleteEnabled);
  const remoteCursors = useStore((s) => s.remoteCursors);

  const historyPanelOpen = useHistoryStore((s) => s.panelOpen);
  const toggleHistoryPanel = useHistoryStore((s) => s.togglePanel);

  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const [runningCells, setRunningCells] = useState<Set<string>>(new Set());
  const [selectedCellIds, setSelectedCellIds] = useState<Set<string>>(new Set());
  const [showPip, setShowPip] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [hiddenCellIds, setHiddenCellIds] = useState<Set<string>>(() => {
    try {
      const key = notebook?.filePath ? `jel:hidden:${notebook.filePath}` : null;
      if (key) { const raw = localStorage.getItem(key); if (raw) return new Set(JSON.parse(raw)); }
    } catch { /* ignore */ }
    return new Set();
  });
  const [showCellPanel, setShowCellPanel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showCodeCellIds, setShowCodeCellIds] = useState<Set<string>>(() => {
    try {
      const key = notebook?.filePath ? `jel:showCode:${notebook.filePath}` : null;
      if (key) { const raw = localStorage.getItem(key); if (raw) return new Set(JSON.parse(raw)); }
    } catch { /* ignore */ }
    return new Set();
  });
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastBroadcast = useRef(0);
  const lastClickedCellId = useRef<string | null>(null);

  const nbId = notebook?.id;
  const nbFilePath = notebook?.filePath;
  const kernelState: KernelState = (nbId && kernelStates[nbId]) || 'disconnected';
  const collabEnabled = useStore((s) => s.collabEnabled);

  // Persist hiddenCellIds to localStorage
  useEffect(() => {
    if (!nbFilePath) return;
    try {
      const key = `jel:hidden:${nbFilePath}`;
      if (hiddenCellIds.size > 0) localStorage.setItem(key, JSON.stringify([...hiddenCellIds]));
      else localStorage.removeItem(key);
    } catch { /* ignore */ }
  }, [hiddenCellIds, nbFilePath]);

  // Persist showCodeCellIds to localStorage
  useEffect(() => {
    if (!nbFilePath) return;
    try {
      const key = `jel:showCode:${nbFilePath}`;
      if (showCodeCellIds.size > 0) localStorage.setItem(key, JSON.stringify([...showCodeCellIds]));
      else localStorage.removeItem(key);
    } catch { /* ignore */ }
  }, [showCodeCellIds, nbFilePath]);

  // Reload persisted sets when switching notebook
  useEffect(() => {
    if (!nbFilePath) return;
    try {
      const hRaw = localStorage.getItem(`jel:hidden:${nbFilePath}`);
      setHiddenCellIds(hRaw ? new Set(JSON.parse(hRaw)) : new Set());
      const scRaw = localStorage.getItem(`jel:showCode:${nbFilePath}`);
      setShowCodeCellIds(scRaw ? new Set(JSON.parse(scRaw)) : new Set());
    } catch {
      setHiddenCellIds(new Set());
      setShowCodeCellIds(new Set());
    }
  }, [nbFilePath]);

  // Stable notebook relative path for collab
  const nbPath = useMemo(() => {
    if (!notebook) return '';
    return notebook.filePath
      ? (currentProject ? notebook.filePath.replace(currentProject.path + '/', '') : notebook.filePath)
      : notebook.fileName;
  }, [notebook, currentProject]);

  // Throttled mouse move handler to broadcast pointer coordinates
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!collabEnabled || !activeCellId || !nbPath) return;
      const now = Date.now();
      if (now - lastBroadcast.current < 80) return; // throttle ~12fps
      lastBroadcast.current = now;

      const rect = scrollRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
      const y = e.clientY - rect.top + (scrollRef.current?.scrollTop ?? 0);
      broadcastCursor(nbPath, activeCellId, x, y);
    },
    [collabEnabled, activeCellId, nbPath]
  );

  // Broadcast cursor position when active cell changes
  useEffect(() => {
    if (!activeCellId || !notebook || !collabEnabled) return;
    const nbPath = notebook.filePath
      ? (currentProject ? notebook.filePath.replace(currentProject.path + '/', '') : notebook.filePath)
      : notebook.fileName;
    broadcastCursor(nbPath, activeCellId);
  }, [activeCellId, notebook, currentProject, collabEnabled]);

  const getOrCreateKernel = useCallback(async () => {
    if (!nbId || !jupyterRunning) return null;

    let ks = kernelServices.get(nbId);
    if (ks?.isConnected()) return ks;

    ks = new KernelService(jupyterPort, jupyterToken);
    ks.onStatus((state) => {
      store.getState().setKernelState(nbId, state as KernelState);
    });

    try {
      store.getState().setKernelState(nbId, 'starting');
      const kernelId = await ks.startKernel('python3');
      store.getState().setKernelId(nbId, kernelId);
      kernelServices.set(nbId, ks);
      return ks;
    } catch (e) {
      console.error('[Kernel] Failed to start:', e);
      store.getState().setKernelState(nbId, 'dead');
      return null;
    }
  }, [nbId, jupyterRunning, jupyterPort, jupyterToken]);

  const runCell = useCallback(
    async (cellId: string) => {
      if (!nbId) return;

      const nb = store.getState().notebooks.find((n) => n.id === nbId);
      const cell = nb?.data.cells.find((c) => c.id === cellId);
      if (!cell) return;

      // Markdown cells: "run" = deactivate to show rendered preview, move focus down
      if (cell.cell_type === 'markdown') {
        const idx = nb!.data.cells.findIndex((c) => c.id === cellId);
        const nextIdx = idx + 1;
        if (nextIdx < nb!.data.cells.length) {
          setActiveCellId(nb!.data.cells[nextIdx].id);
        } else {
          setActiveCellId(null); // deactivate to show rendered markdown
        }
        return;
      }

      if (!cell.source.trim()) return;

      const ks = await getOrCreateKernel();
      if (!ks) return;

      // Clear previous outputs
      store.getState().clearCellOutputs(nbId, cellId);
      setRunningCells((prev) => new Set(prev).add(cellId));

      // Resolve %use directives if present
      let codeToRun = cell.source;
      const project = store.getState().currentProject;
      if (hasUse(codeToRun)) {
        codeToRun = await resolveUse(codeToRun, {
          currentNotebookPath: nb?.filePath ?? null,
          projectPath: project?.path ?? null,
        });
      }
      // Resolve %ask directives (remote code sharing)
      if (hasAsk(codeToRun) && store.getState().ipfsRunning) {
        const collab = getCollab();
        if (collab) {
          codeToRun = await resolveAsk(codeToRun, collab.codeShare);
        }
      }

      ks.executeCode(
        codeToRun,
        (output: CellOutput) => {
          store.getState().appendCellOutput(nbId, cellId, output);
        },
        (executionCount) => {
          store.getState().setCellExecutionCount(nbId, cellId, executionCount);
          setRunningCells((prev) => {
            const next = new Set(prev);
            next.delete(cellId);
            return next;
          });
        },
        () => {} // status handled globally
      );
    },
    [nbId, getOrCreateKernel]
  );

  const runCellAndInsert = useCallback(
    (cellId: string) => {
      if (!nbId || !notebook) return;
      runCell(cellId);
      const idx = notebook.data.cells.findIndex((c) => c.id === cellId);
      store.getState().addCell(nbId, 'code', idx);
      // Focus next cell after a tick
      setTimeout(() => {
        const cells = store.getState().notebooks.find((n) => n.id === nbId)?.data.cells;
        if (cells && idx + 1 < cells.length) {
          setActiveCellId(cells[idx + 1].id);
        }
      }, 50);
    },
    [nbId, notebook, runCell]
  );

  const runAll = useCallback(async () => {
    if (!notebook) return;

    const ks = await getOrCreateKernel();
    if (!ks) return;

    // Collect %use dependencies and pre-run them
    const useDeps = new Set<string>();
    const useRegex = /^%use\s+(\S+)/gm;
    for (const cell of notebook.data.cells) {
      if (cell.cell_type !== 'code') continue;
      useRegex.lastIndex = 0;
      let m;
      while ((m = useRegex.exec(cell.source)) !== null) {
        const raw = m[1].trim();
        const colonIdx = raw.lastIndexOf(':');
        const nbPath = colonIdx > 0 && !raw.substring(colonIdx).includes('/')
          ? raw.substring(0, colonIdx).trim()
          : raw;
        useDeps.add(nbPath);
      }
    }

    if (useDeps.size > 0) {
      const project = store.getState().currentProject;
      const { parseNotebook } = await import('../utils/notebook');

      for (const dep of useDeps) {
        // Resolve path
        let depPath: string | null = null;
        if (dep.startsWith('/')) {
          depPath = dep;
        } else if (notebook.filePath) {
          const dir = notebook.filePath.substring(0, notebook.filePath.lastIndexOf('/'));
          depPath = `${dir}/${dep}`;
        } else if (project?.path) {
          depPath = `${project.path}/${dep}`;
        }
        if (!depPath) continue;

        const fileResult = await window.labAPI.fs.readFile(depPath);
        if (!fileResult.success || !fileResult.data) continue;

        let depNb;
        try {
          depNb = parseNotebook(fileResult.data);
        } catch {
          continue;
        }

        // Execute each code cell from the dependency, awaiting completion
        for (const depCell of depNb.cells) {
          if (depCell.cell_type !== 'code' || !depCell.source.trim()) continue;
          await new Promise<void>((resolve) => {
            ks.executeCode(depCell.source, () => {}, () => resolve(), () => {});
          });
        }
      }
    }

    // Run main notebook cells
    for (const cell of notebook.data.cells) {
      if (cell.cell_type === 'code') {
        await new Promise<void>((resolve) => {
          runCell(cell.id);
          // Wait a bit between cells to let execution queue
          setTimeout(resolve, 100);
        });
      }
    }
  }, [notebook, runCell, getOrCreateKernel]);

  // Handle bridge run-cell events from mobile clients
  useEffect(() => {
    const handler = (e: Event) => {
      const { notebookId, cellId } = (e as CustomEvent).detail;
      if (notebookId === nbId) {
        runCell(cellId);
      }
    };
    window.addEventListener('bridge:run-cell', handler);
    return () => window.removeEventListener('bridge:run-cell', handler);
  }, [nbId, runCell]);

  // Handle bridge kernel restart/interrupt from mobile clients
  useEffect(() => {
    const handleRestart = async (e: Event) => {
      const { notebookId } = (e as CustomEvent).detail;
      if (notebookId === nbId) {
        const ks = kernelServices.get(nbId);
        if (ks) {
          await ks.restartKernel();
          window.labAPI.bridge.broadcast({ event: 'kernel-restarted', notebookId: nbId });
        }
      }
    };
    const handleInterrupt = async (e: Event) => {
      const { notebookId } = (e as CustomEvent).detail;
      if (notebookId === nbId) {
        const ks = kernelServices.get(nbId);
        if (ks) {
          await ks.interruptKernel();
          window.labAPI.bridge.broadcast({ event: 'kernel-interrupted', notebookId: nbId });
        }
      }
    };
    window.addEventListener('bridge:restart-kernel', handleRestart);
    window.addEventListener('bridge:interrupt-kernel', handleInterrupt);
    return () => {
      window.removeEventListener('bridge:restart-kernel', handleRestart);
      window.removeEventListener('bridge:interrupt-kernel', handleInterrupt);
    };
  }, [nbId]);

  // Broadcast cell outputs to mobile clients when bridge is active
  useEffect(() => {
    if (!nbId) return;
    const unsub = useStore.subscribe((state, prev) => {
      if (!state.bridgeRunning) return;
      const nb = state.notebooks.find((n) => n.id === nbId);
      const prevNb = prev.notebooks.find((n) => n.id === nbId);
      if (!nb || !prevNb) return;

      for (let i = 0; i < nb.data.cells.length; i++) {
        const cell = nb.data.cells[i];
        const prevCell = prevNb.data.cells.find((c) => c.id === cell.id);
        if (!prevCell) continue;
        // Broadcast new outputs
        if (cell.outputs !== prevCell.outputs && cell.outputs.length > prevCell.outputs.length) {
          const newOutput = cell.outputs[cell.outputs.length - 1];
          window.labAPI.bridge.broadcast({
            event: 'cell-output',
            notebookId: nbId,
            cellId: cell.id,
            output: newOutput,
          });
        }
        // Broadcast execution count changes
        if (cell.execution_count !== prevCell.execution_count && cell.execution_count != null) {
          window.labAPI.bridge.broadcast({
            event: 'cell-execution-count',
            notebookId: nbId,
            cellId: cell.id,
            executionCount: cell.execution_count,
          });
        }
      }
    });
    return unsub;
  }, [nbId]);

  const handleSave = useCallback(async () => {
    if (!notebook) return;
    const { serializeNotebook } = await import('../utils/notebook');

    let filePath = notebook.filePath;

    if (!filePath) {
      const result = await window.labAPI.dialog.saveFile({
        defaultPath: notebook.fileName,
      });
      if (result.canceled || !result.filePath) return;
      filePath = result.filePath;
    }

    const content = serializeNotebook(notebook.data);
    const result = await window.labAPI.fs.writeFile(filePath, content);

    if (result.success) {
      store.getState().markClean(notebook.id, filePath);
    }
  }, [notebook]);

  const handleSaveAs = useCallback(async () => {
    if (!notebook) return;
    const { serializeNotebook } = await import('../utils/notebook');

    const result = await window.labAPI.dialog.saveFile({
      defaultPath: notebook.fileName,
    });
    if (result.canceled || !result.filePath) return;

    const content = serializeNotebook(notebook.data);
    const writeResult = await window.labAPI.fs.writeFile(result.filePath, content);

    if (writeResult.success) {
      store.getState().markClean(notebook.id, result.filePath);
    }
  }, [notebook]);

  const startJupyter = useCallback(async () => {
    const result = await window.labAPI.jupyter.start();
    if (result.success) {
      store.getState().setJupyterRunning(true, result.port, result.token);
    }
  }, []);

  const restartKernel = useCallback(async () => {
    if (!nbId) return;
    const ks = kernelServices.get(nbId);
    if (ks) {
      await ks.restartKernel();
    }
  }, [nbId]);

  const interruptKernel = useCallback(async () => {
    if (!nbId) return;
    const ks = kernelServices.get(nbId);
    if (ks) {
      await ks.interruptKernel();
    }
  }, [nbId]);

  const focusCellByOffset = useCallback(
    (currentId: string, offset: number) => {
      if (!notebook) return;
      const idx = notebook.data.cells.findIndex((c) => c.id === currentId);
      const targetIdx = idx + offset;
      if (targetIdx >= 0 && targetIdx < notebook.data.cells.length) {
        setActiveCellId(notebook.data.cells[targetIdx].id);
        setSelectedCellIds(new Set());
      }
    },
    [notebook]
  );

  // Multi-select click handler
  const handleCellClick = useCallback(
    (cellId: string, event: React.MouseEvent) => {
      if (!notebook) return;
      const cells = notebook.data.cells;

      if (event.shiftKey && lastClickedCellId.current) {
        // Range select
        const startIdx = cells.findIndex((c) => c.id === lastClickedCellId.current);
        const endIdx = cells.findIndex((c) => c.id === cellId);
        if (startIdx >= 0 && endIdx >= 0) {
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx);
          setSelectedCellIds(new Set(cells.slice(lo, hi + 1).map((c) => c.id)));
        }
      } else if (event.metaKey || event.ctrlKey) {
        // Toggle individual
        setSelectedCellIds((prev) => {
          const next = new Set(prev);
          if (next.has(cellId)) next.delete(cellId);
          else next.add(cellId);
          return next;
        });
      } else {
        // Normal click: clear multi-select
        setSelectedCellIds(new Set());
      }

      lastClickedCellId.current = cellId;
      setActiveCellId(cellId);
    },
    [notebook]
  );

  // Keyboard shortcuts for cell copy/cut/paste
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!notebook || !nbId) return;

      // Cmd+F / Ctrl+F: open search
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyF' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setShowSearch(true);
        return;
      }

      // Escape clears selection (no modifier needed)
      if (e.code === 'Escape' && selectedCellIds.size > 0) {
        e.preventDefault();
        setSelectedCellIds(new Set());
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      const multiSelected = selectedCellIds.size > 1;
      const editorFocused = !!document.activeElement?.closest('.cm-content');
      if (!multiSelected && editorFocused) return;

      // Effective set of cells
      const effectiveIds = selectedCellIds.size > 0
        ? selectedCellIds
        : activeCellId ? new Set([activeCellId]) : new Set<string>();
      if (effectiveIds.size === 0 && e.code !== 'KeyV') return;

      // Get cells in document order
      const orderedCells = notebook.data.cells.filter((c) => effectiveIds.has(c.id));

      if (e.code === 'KeyC' && !e.shiftKey) {
        if (orderedCells.length === 0) return;
        e.preventDefault();
        setCellClipboard(orderedCells.map((c) => ({
          cell_type: c.cell_type,
          source: c.source,
          outputs: [...c.outputs],
          metadata: { ...c.metadata },
        })));
      } else if (e.code === 'KeyX' && !e.shiftKey) {
        if (orderedCells.length === 0) return;
        e.preventDefault();
        setCellClipboard(orderedCells.map((c) => ({
          cell_type: c.cell_type,
          source: c.source,
          outputs: [...c.outputs],
          metadata: { ...c.metadata },
        })));
        store.getState().deleteCells(nbId, orderedCells.map((c) => c.id));
        setSelectedCellIds(new Set());
        const remaining = store.getState().notebooks.find((n) => n.id === nbId)?.data.cells;
        if (remaining && remaining.length > 0) {
          setActiveCellId(remaining[0].id);
        }
      } else if (e.code === 'KeyV' && !e.shiftKey) {
        const clip = getCellClipboard();
        if (clip.length === 0) return;
        e.preventDefault();
        const newCells = clip.map((cc) => ({
          ...createCell(cc.cell_type, cc.source),
          outputs: cc.outputs,
          metadata: cc.metadata,
        }));
        store.getState().insertCellsAfter(nbId, activeCellId, newCells);
        setSelectedCellIds(new Set());
        setTimeout(() => setActiveCellId(newCells[newCells.length - 1].id), 50);
      } else if (e.code === 'KeyA' && !e.shiftKey && !editorFocused) {
        e.preventDefault();
        setSelectedCellIds(new Set(notebook.data.cells.map((c) => c.id)));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCellIds.size > 1 && !editorFocused) {
        e.preventDefault();
        store.getState().deleteCells(nbId, [...selectedCellIds]);
        setSelectedCellIds(new Set());
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [notebook, nbId, selectedCellIds, activeCellId]);

  const handleShareCID = useCallback(async () => {
    if (!notebook || !currentProject) return;
    const collab = getCollab();
    if (!collab) return;
    const { serializeNotebook } = await import('../utils/notebook');
    const content = serializeNotebook(notebook.data);
    const relativePath = notebook.filePath
      ? notebook.filePath.replace(currentProject.path + '/', '')
      : notebook.fileName;
    const cid = await collab.shareNotebookCID(relativePath, content);
    if (cid) {
      console.log('[Share] CID:', cid);
    }
  }, [notebook, currentProject]);

  const handleNavigateLink = useCallback(
    async (link: NotebookLink) => {
      if (!currentProject) return;
      const filePath = `${currentProject.path}/${link.targetNotebook}`;

      // Check if already open
      const existing = store.getState().notebooks.find((n) => n.filePath === filePath);
      if (existing) {
        store.getState().setActiveNotebook(existing.id);
        return;
      }

      const { parseNotebook } = await import('../utils/notebook');
      const { v4: uuidv4 } = await import('uuid');
      const fileResult = await window.labAPI.fs.readFile(filePath);
      if (!fileResult.success || !fileResult.data) return;

      const data = parseNotebook(fileResult.data);
      const fileName = link.targetNotebook.split('/').pop() || 'notebook.ipynb';
      store.getState().addNotebook({
        id: uuidv4(),
        filePath,
        fileName,
        data,
        dirty: false,
        kernelId: null,
      });
    },
    [currentProject]
  );

  // Check if notebook has .ipynb links in markdown cells
  const hasLinkedNotebooks = useMemo(() => {
    if (!notebook) return false;
    const regex = /\[.*?\]\(.*?\.ipynb\)/;
    return notebook.data.cells.some((c) => c.cell_type === 'markdown' && regex.test(c.source));
  }, [notebook]);

  const handleExportPdf = useCallback(async (scope: ExportScope) => {
    if (!nbId) return;
    const allNotebooks = store.getState().notebooks;
    const html = generatePdfHtml({
      scope,
      notebookId: nbId,
      notebooks: allNotebooks,
      hiddenCellIds,
      showCodeCellIds,
    });
    const title = scope === 'project'
      ? currentProject?.name || 'project'
      : notebook?.fileName.replace('.ipynb', '') || 'notebook';
    await window.labAPI.notebook.exportPDF({ html, title });
    setShowExportDialog(false);
  }, [nbId, notebook, currentProject, hiddenCellIds, showCodeCellIds]);

  // Expose save handlers for menu events
  (window as unknown as Record<string, unknown>).__labSave = handleSave;
  (window as unknown as Record<string, unknown>).__labSaveAs = handleSaveAs;
  (window as unknown as Record<string, unknown>).__labStartJupyter = startJupyter;
  (window as unknown as Record<string, unknown>).__labRestartKernel = restartKernel;
  (window as unknown as Record<string, unknown>).__labInterruptKernel = interruptKernel;

  if (!notebook) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-600">
        <p className="text-sm">Ouvrez ou creez un notebook pour commencer</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
      {/* Titlebar drag */}
      <div className="titlebar-drag h-10 flex items-center px-4">
        <span className={`text-sm ${notebook.dirty ? 'text-orange-400' : 'text-slate-400'} flex-1`}>
          {notebook.dirty && <span className="mr-1">*</span>}
          {notebook.fileName}
        </span>
        <button
          onClick={() => { toggleHistoryPanel(); if (!historyPanelOpen) setShowCellPanel(false); }}
          className={`p-1 rounded transition-colors ${historyPanelOpen ? 'text-violet-400 bg-violet-500/10' : 'text-slate-600 hover:text-slate-400'}`}
          title="Historique (Ctrl+Alt+H)"
        >
          <GitBranch className="w-4 h-4" />
        </button>
      </div>

      <Toolbar
        kernelState={kernelState}
        jupyterRunning={jupyterRunning}
        dirty={notebook.dirty}
        peerCount={peers.length}
        ipfsRunning={ipfsRunning}
        autocompleteEnabled={autocompleteEnabled}
        viewMode={viewMode}
        onSave={handleSave}
        onRunAll={runAll}
        onAddCodeCell={() => store.getState().addCell(nbId!, 'code')}
        onAddMarkdownCell={() => store.getState().addCell(nbId!, 'markdown')}
        onRestartKernel={restartKernel}
        onInterruptKernel={interruptKernel}
        onStartJupyter={startJupyter}
        onShareCID={handleShareCID}
        onToggleAutocomplete={() => store.getState().setAutocompleteEnabled(!autocompleteEnabled)}
        showCellPanel={showCellPanel}
        onTogglePip={() => setShowPip((v) => !v)}
        onToggleViewMode={() => setViewMode((v) => !v)}
        onToggleCellPanel={() => {
          setShowCellPanel((v) => !v);
          if (!showCellPanel && historyPanelOpen) toggleHistoryPanel();
        }}
        onToggleSearch={() => setShowSearch(true)}
        onExportPdf={() => setShowExportDialog(true)}
      />

      {showPip && <PipPanel onClose={() => setShowPip(false)} />}

      <NotebookLinks onNavigate={handleNavigateLink} />

      {/* Cells */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 relative" onMouseMove={handleMouseMove}>
        {/* Remote cursor overlays */}
        {collabEnabled && <RemoteCursors notebookPath={nbPath} scrollRef={scrollRef} />}

        <div className="max-w-4xl mx-auto">
          {notebook.data.cells.map((cell, index) => {
            const isHidden = hiddenCellIds.has(cell.id);
            const cellLabel = (cell.metadata?.label as string) || '';

            // In view mode, hidden cells are completely invisible
            if (isHidden && viewMode) return null;

            // In edit mode, hidden cells show collapsed placeholder
            if (isHidden && !viewMode) {
              return (
                <div
                  key={cell.id}
                  ref={(el) => { if (el) cellRefs.current.set(cell.id, el); else cellRefs.current.delete(cell.id); }}
                  className="mb-2 px-3 py-1.5 rounded-lg border border-dashed border-slate-700/40 bg-slate-800/10 flex items-center gap-2 cursor-pointer hover:border-slate-600/50"
                  onClick={() => setHiddenCellIds((prev) => { const next = new Set(prev); next.delete(cell.id); return next; })}
                >
                  <EyeOff className="w-3 h-3 text-slate-600" />
                  <span className="text-xs text-slate-600">
                    Cellule masquee{cellLabel ? `: ${cellLabel}` : ''}
                  </span>
                </div>
              );
            }

            const remotePeersOnCell = Object.values(remoteCursors)
              .filter((rc) => rc.notebookPath === nbPath && rc.cellId === cell.id && rc.visible !== false)
              .map((rc) => ({ peerId: rc.peerId, peerName: rc.peerName }));

            return (
            <div key={cell.id} ref={(el) => { if (el) cellRefs.current.set(cell.id, el); else cellRefs.current.delete(cell.id); }}>
            <Cell
              cell={cell}
              index={index}
              isActive={activeCellId === cell.id}
              isRunning={runningCells.has(cell.id)}
              isSelected={selectedCellIds.has(cell.id)}
              autocompleteEnabled={autocompleteEnabled}
              viewMode={viewMode}
              showCode={showCodeCellIds.has(cell.id)}
              label={cellLabel}
              remotePeers={remotePeersOnCell.length > 0 ? remotePeersOnCell : undefined}
              onCellClick={(e) => handleCellClick(cell.id, e)}
              onSourceChange={(source) =>
                store.getState().updateCellSource(nbId!, cell.id, source)
              }
              onRun={() => runCell(cell.id)}
              onRunAndInsert={() => runCellAndInsert(cell.id)}
              onDelete={() => store.getState().deleteCell(nbId!, cell.id)}
              onMoveUp={() => store.getState().moveCellUp(nbId!, cell.id)}
              onMoveDown={() => store.getState().moveCellDown(nbId!, cell.id)}
              onToggleType={() =>
                store
                  .getState()
                  .updateCellType(
                    nbId!,
                    cell.id,
                    cell.cell_type === 'code' ? 'markdown' : 'code'
                  )
              }
              onFocusUp={() => focusCellByOffset(cell.id, -1)}
              onFocusDown={() => focusCellByOffset(cell.id, 1)}
            />
            </div>
            );
          })}

          {/* Add cell button at bottom — hidden in view mode */}
          {!viewMode && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => store.getState().addCell(nbId!, 'code')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 border border-dashed border-slate-700/40 hover:border-slate-600/60 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajouter une cellule
            </button>
          </div>
          )}
        </div>
      </div>
      </div>

      {/* History panel */}
      {historyPanelOpen && nbId && <HistoryPanel notebookId={nbId} />}

      {/* Cell panel */}
      {showCellPanel && notebook && (
        <CellPanel
          cells={notebook.data.cells}
          activeCellId={activeCellId}
          hiddenCellIds={hiddenCellIds}
          showCodeCellIds={showCodeCellIds}
          onToggleHidden={(cellId) => {
            setHiddenCellIds((prev) => {
              const next = new Set(prev);
              if (next.has(cellId)) next.delete(cellId);
              else next.add(cellId);
              return next;
            });
          }}
          onToggleShowCode={(cellId) => {
            setShowCodeCellIds((prev) => {
              const next = new Set(prev);
              if (next.has(cellId)) next.delete(cellId);
              else next.add(cellId);
              return next;
            });
          }}
          onShowAll={() => setHiddenCellIds(new Set())}
          onHideAll={() => {
            if (notebook) setHiddenCellIds(new Set(notebook.data.cells.map((c) => c.id)));
          }}
          onUpdateLabel={(cellId, label) => {
            store.getState().updateCellMetadata(nbId!, cellId, { label: label || undefined });
          }}
          onNavigateToCell={(cellId) => {
            setActiveCellId(cellId);
            // Scroll into view
            const el = cellRefs.current.get(cellId);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }}
          onClose={() => setShowCellPanel(false)}
        />
      )}

      {/* Export PDF dialog */}
      {showExportDialog && notebook && (
        <ExportPdfDialog
          notebookName={notebook.fileName}
          hasLinkedNotebooks={hasLinkedNotebooks}
          hasProject={!!currentProject}
          onExport={handleExportPdf}
          onClose={() => setShowExportDialog(false)}
        />
      )}

      {/* Search overlay */}
      {showSearch && (
        <SearchOverlay
          notebooks={store.getState().notebooks}
          onNavigate={(notebookId, cellId) => {
            if (notebookId !== nbId) {
              store.getState().setActiveNotebook(notebookId);
            }
            setActiveCellId(cellId);
            setTimeout(() => {
              const el = cellRefs.current.get(cellId);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
