import { useState, useEffect, useCallback } from 'react';
import { ConnectionScreen } from './components/ConnectionScreen';
import { NotebookList } from './components/NotebookList';
import { MobileNotebook } from './components/MobileNotebook';
import { bridge } from './services/wsBridge';
import type { NotebookSummary, NotebookData, BridgeEvent } from './services/wsBridge';

type Screen = 'connect' | 'notebooks' | 'notebook';

export interface CollabStatus {
  active: boolean;
  peerName: string;
  peers: Array<{ id: string; name: string; status: string }>;
}

export interface HistoryNodeLight {
  id: string;
  parentId: string | null;
  children: string[];
  timestamp: number;
  action: { type: string; cellId?: string; cellType?: string; direction?: string };
  peerId?: string;
  peerName?: string;
}

export interface HistoryData {
  notebookId: string;
  rootId: string;
  currentNodeId: string;
  nodes: Record<string, HistoryNodeLight>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('connect');
  const [error, setError] = useState<string | null>(null);
  const [notebooks, setNotebooks] = useState<NotebookSummary[]>([]);
  const [currentNotebook, setCurrentNotebook] = useState<NotebookData | null>(null);
  const [runningCells, setRunningCells] = useState<Set<string>>(new Set());
  const [collabStatus, setCollabStatus] = useState<CollabStatus | null>(null);
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [kernelBusy, setKernelBusy] = useState(false);
  const [pipResult, setPipResult] = useState<{ success: boolean; output?: string; error?: string } | null>(null);
  const [pipPackages, setPipPackages] = useState<Array<{ name: string; version: string }>>([]);

  // Auto-connect if URL has token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token && window.location.host) {
      handleConnect(window.location.host, token);
    }
  }, []);

  // Listen for bridge events
  useEffect(() => {
    const cleanup = bridge.onEvent((evt: BridgeEvent) => {
      switch (evt.event) {
        case 'connected':
          setScreen('notebooks');
          setError(null);
          bridge.listNotebooks();
          bridge.getCollabStatus();
          break;

        case 'disconnected':
          if (evt.code === 4001) {
            setError('PIN invalide');
            setScreen('connect');
          }
          break;

        case 'notebooks':
          setNotebooks(evt.data as NotebookSummary[]);
          break;

        case 'notebook-data':
          setCurrentNotebook(evt.data as NotebookData);
          setScreen('notebook');
          break;

        case 'cell-changed': {
          const { notebookId, cellId, source } = evt as { notebookId: string; cellId: string; source: string; event: string };
          setCurrentNotebook((prev) => {
            if (!prev || prev.id !== notebookId) return prev;
            return {
              ...prev,
              cells: prev.cells.map((c) => (c.id === cellId ? { ...c, source } : c)),
            };
          });
          break;
        }

        case 'cell-output': {
          const { notebookId, cellId, output } = evt as { notebookId: string; cellId: string; output: unknown; event: string };
          setRunningCells((prev) => new Set(prev).add(cellId));
          setKernelBusy(true);
          setCurrentNotebook((prev) => {
            if (!prev || prev.id !== notebookId) return prev;
            return {
              ...prev,
              cells: prev.cells.map((c) =>
                c.id === cellId ? { ...c, outputs: [...c.outputs, output as CellOutput] } : c
              ),
            };
          });
          break;
        }

        case 'cell-clear': {
          const { notebookId, cellId } = evt as { notebookId: string; cellId: string; event: string };
          setRunningCells((prev) => new Set(prev).add(cellId));
          setKernelBusy(true);
          setCurrentNotebook((prev) => {
            if (!prev || prev.id !== notebookId) return prev;
            return {
              ...prev,
              cells: prev.cells.map((c) =>
                c.id === cellId ? { ...c, outputs: [], execution_count: null } : c
              ),
            };
          });
          break;
        }

        case 'cell-execution-count': {
          const { notebookId, cellId, executionCount } = evt as { notebookId: string; cellId: string; executionCount: number; event: string };
          setRunningCells((prev) => {
            const next = new Set(prev);
            next.delete(cellId);
            return next;
          });
          setKernelBusy(false);
          setCurrentNotebook((prev) => {
            if (!prev || prev.id !== notebookId) return prev;
            return {
              ...prev,
              cells: prev.cells.map((c) =>
                c.id === cellId ? { ...c, execution_count: executionCount } : c
              ),
            };
          });
          break;
        }

        case 'kernel-status': {
          const { cellId, status } = evt as { cellId: string; status: string; event: string };
          if (status === 'busy') {
            setRunningCells((prev) => new Set(prev).add(cellId));
            setKernelBusy(true);
          } else {
            setRunningCells((prev) => {
              const next = new Set(prev);
              next.delete(cellId);
              return next;
            });
            setKernelBusy(false);
          }
          break;
        }

        case 'kernel-restarted':
          setRunningCells(new Set());
          setKernelBusy(false);
          break;

        case 'kernel-interrupted':
          setRunningCells(new Set());
          setKernelBusy(false);
          break;

        case 'collab-status':
          setCollabStatus(evt.data as CollabStatus);
          break;

        case 'history-data':
          setHistoryData(evt.data as HistoryData);
          break;

        case 'history-current': {
          const { currentNodeId } = evt.data as { notebookId: string; currentNodeId: string };
          setHistoryData((prev) => prev ? { ...prev, currentNodeId } : null);
          break;
        }

        case 'pip-result':
          setPipResult(evt.data as { success: boolean; output?: string; error?: string });
          break;

        case 'pip-list': {
          const pipData = evt.data as { success: boolean; packages?: Array<{ name: string; version: string }> };
          if (pipData.success && pipData.packages) {
            setPipPackages(pipData.packages);
          }
          break;
        }
      }
    });

    return cleanup;
  }, []);

  const handleConnect = useCallback(async (host: string, pin: string) => {
    setError(null);
    try {
      await bridge.connect(host, pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    bridge.disconnect();
    setScreen('connect');
    setNotebooks([]);
    setCurrentNotebook(null);
    setCollabStatus(null);
    setHistoryData(null);
  }, []);

  const handleSelectNotebook = useCallback((id: string) => {
    bridge.getNotebook(id);
    bridge.getHistory(id);
  }, []);

  const handleRefresh = useCallback(() => {
    bridge.listNotebooks();
    bridge.getCollabStatus();
  }, []);

  const handleCreateNotebook = useCallback(() => {
    bridge.createNotebook();
  }, []);

  switch (screen) {
    case 'connect':
      return <ConnectionScreen onConnect={handleConnect} error={error} />;

    case 'notebooks':
      return (
        <NotebookList
          notebooks={notebooks}
          onSelect={handleSelectNotebook}
          onRefresh={handleRefresh}
          onDisconnect={handleDisconnect}
          onCreateNotebook={handleCreateNotebook}
          collabStatus={collabStatus}
        />
      );

    case 'notebook':
      if (!currentNotebook) return null;
      return (
        <MobileNotebook
          notebook={currentNotebook}
          runningCells={runningCells}
          kernelBusy={kernelBusy}
          historyData={historyData}
          pipResult={pipResult}
          pipPackages={pipPackages}
          onBack={() => {
            setScreen('notebooks');
            setCurrentNotebook(null);
            setHistoryData(null);
          }}
        />
      );
  }
}

// Type import for cell output
type CellOutput = {
  output_type: string;
  text?: string | string[];
  data?: Record<string, string | string[]>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
};
