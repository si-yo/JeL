import { useState } from 'react';
import { ChevronLeft, Play, Loader2, Plus, RotateCcw, Square, History, Package } from 'lucide-react';
import { MobileCell } from './MobileCell';
import { MobileHistory } from './MobileHistory';
import { MobilePackages } from './MobilePackages';
import { bridge } from '../services/wsBridge';
import type { NotebookData } from '../services/wsBridge';
import type { HistoryData } from '../App';

interface Props {
  notebook: NotebookData;
  runningCells: Set<string>;
  kernelBusy: boolean;
  historyData: HistoryData | null;
  pipResult: { success: boolean; output?: string; error?: string } | null;
  pipPackages: Array<{ name: string; version: string }>;
  onBack: () => void;
}

export function MobileNotebook({ notebook, runningCells, kernelBusy, historyData, pipResult, pipPackages, onBack }: Props) {
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showPackages, setShowPackages] = useState(false);

  const handleRunAll = () => {
    setRunAllLoading(true);
    const codeCells = notebook.cells.filter((c) => c.cell_type === 'code');
    for (const cell of codeCells) {
      bridge.runCell(notebook.id, cell.id);
    }
    setTimeout(() => setRunAllLoading(false), 1000);
  };

  const handleRestart = () => {
    bridge.restartKernel(notebook.id);
  };

  const handleInterrupt = () => {
    bridge.interruptKernel(notebook.id);
  };

  const handleToggleHistory = () => {
    if (!showHistory) {
      bridge.getHistory(notebook.id);
    }
    setShowHistory(!showHistory);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 bg-slate-800/80 border-b border-slate-700/50 shrink-0">
        <button
          onClick={onBack}
          className="p-1 -ml-1 rounded text-slate-400 hover:text-slate-200"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium text-slate-200 truncate flex-1">
          {notebook.fileName}
        </span>
        <button
          onClick={handleInterrupt}
          disabled={!kernelBusy}
          className="p-1.5 rounded text-slate-500 hover:text-orange-400 disabled:opacity-30"
          title="Interrompre"
        >
          <Square className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleRestart}
          className="p-1.5 rounded text-slate-500 hover:text-amber-400"
          title="Redemarrer le kernel"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleToggleHistory}
          className={`p-1.5 rounded ${showHistory ? 'text-violet-400 bg-violet-500/15' : 'text-slate-500 hover:text-violet-400'}`}
          title="Historique"
        >
          <History className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => { setShowPackages((v) => !v); if (!showPackages) bridge.pipList(); }}
          className={`p-1.5 rounded ${showPackages ? 'text-indigo-400 bg-indigo-500/15' : 'text-slate-500 hover:text-indigo-400'}`}
          title="Packages"
        >
          <Package className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleRunAll}
          disabled={runAllLoading}
          className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs"
        >
          {runAllLoading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          Tout executer
        </button>
      </div>

      {/* History panel (overlay) */}
      {showHistory && historyData && (
        <MobileHistory
          notebookId={notebook.id}
          historyData={historyData}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Packages panel (overlay) */}
      {showPackages && (
        <MobilePackages
          pipResult={pipResult}
          pipPackages={pipPackages}
          onClose={() => setShowPackages(false)}
        />
      )}

      {/* Cells */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {notebook.cells.map((cell, index) => (
          <MobileCell
            key={cell.id}
            cell={cell}
            notebookId={notebook.id}
            index={index}
            totalCells={notebook.cells.length}
            running={runningCells.has(cell.id)}
            onUpdateSource={(source) => bridge.updateCell(notebook.id, cell.id, source)}
            onRun={() => bridge.runCell(notebook.id, cell.id)}
            onDelete={() => bridge.deleteCell(notebook.id, cell.id)}
            onToggleType={() => bridge.toggleCellType(notebook.id, cell.id)}
            onMoveUp={() => bridge.moveCellUp(notebook.id, cell.id)}
            onMoveDown={() => bridge.moveCellDown(notebook.id, cell.id)}
            onAddCellAfter={(type) => bridge.addCell(notebook.id, type, index)}
          />
        ))}

        {/* Add cell button at bottom */}
        <div className="flex justify-center py-3 gap-2">
          <button
            onClick={() => bridge.addCell(notebook.id, 'code', notebook.cells.length - 1)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 border border-dashed border-slate-700/40 hover:border-slate-600/60 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Code
          </button>
          <button
            onClick={() => bridge.addCell(notebook.id, 'markdown', notebook.cells.length - 1)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-300 border border-dashed border-slate-700/40 hover:border-slate-600/60 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Markdown
          </button>
        </div>
      </div>
    </div>
  );
}
