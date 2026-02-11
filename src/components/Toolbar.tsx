import { cn } from '../utils/cn';
import { KernelStatus } from './KernelStatus';
import type { KernelState } from '../types';
import {
  Play,
  Plus,
  Save,
  RotateCcw,
  Square,
  Zap,
  Code,
  Type,
  Share2,
  Users,
  Sparkles,
  Package,
  Eye,
  EyeOff,
  List,
  Search,
  FileDown,
} from 'lucide-react';

interface ToolbarProps {
  kernelState: KernelState;
  jupyterRunning: boolean;
  dirty: boolean;
  peerCount: number;
  ipfsRunning: boolean;
  autocompleteEnabled: boolean;
  viewMode: boolean;
  onSave: () => void;
  onRunAll: () => void;
  onAddCodeCell: () => void;
  onAddMarkdownCell: () => void;
  onRestartKernel: () => void;
  onInterruptKernel: () => void;
  onStartJupyter: () => void;
  onShareCID: () => void;
  onToggleAutocomplete: () => void;
  showCellPanel: boolean;
  onTogglePip: () => void;
  onToggleViewMode: () => void;
  onToggleCellPanel: () => void;
  onToggleSearch: () => void;
  onExportPdf?: () => void;
}

export function Toolbar({
  kernelState,
  jupyterRunning,
  dirty,
  peerCount,
  ipfsRunning,
  autocompleteEnabled,
  viewMode,
  onSave,
  onRunAll,
  onAddCodeCell,
  onAddMarkdownCell,
  onRestartKernel,
  onInterruptKernel,
  onStartJupyter,
  onShareCID,
  onToggleAutocomplete,
  showCellPanel,
  onTogglePip,
  onToggleViewMode,
  onToggleCellPanel,
  onToggleSearch,
  onExportPdf,
}: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-700/50 bg-slate-800/60">
      <button
        onClick={onSave}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors',
          dirty
            ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
            : 'text-slate-400 hover:bg-slate-700/50'
        )}
        title="Sauvegarder (Cmd+S)"
      >
        <Save className="w-3.5 h-3.5" />
        {dirty && <span>Sauvegarder</span>}
      </button>

      <div className="w-px h-5 bg-slate-700/50 mx-1" />

      <button
        onClick={onAddCodeCell}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-700/50"
        title="Ajouter cellule code"
      >
        <Plus className="w-3.5 h-3.5" />
        <Code className="w-3 h-3" />
      </button>

      <button
        onClick={onAddMarkdownCell}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-700/50"
        title="Ajouter cellule markdown"
      >
        <Plus className="w-3.5 h-3.5" />
        <Type className="w-3 h-3" />
      </button>

      <div className="w-px h-5 bg-slate-700/50 mx-1" />

      {jupyterRunning ? (
        <>
          <button
            onClick={onRunAll}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-emerald-400 hover:bg-emerald-500/20"
            title="Executer tout"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Run All</span>
          </button>

          <button
            onClick={onInterruptKernel}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-700/50"
            title="Interrompre"
          >
            <Square className="w-3 h-3" />
          </button>

          <button
            onClick={onRestartKernel}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-700/50"
            title="Redemarrer kernel"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onTogglePip}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-400 hover:bg-slate-700/50"
            title="Packages Python (pip)"
          >
            <Package className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <button
          onClick={onStartJupyter}
          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-amber-400 hover:bg-amber-500/20"
          title="Demarrer Jupyter"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Demarrer Jupyter</span>
        </button>
      )}

      <div className="w-px h-5 bg-slate-700/50 mx-1" />

      {/* Autocomplete toggle */}
      <button
        onClick={onToggleAutocomplete}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
          autocompleteEnabled
            ? 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
            : 'text-slate-500 hover:bg-slate-700/50 hover:text-slate-400'
        )}
        title={autocompleteEnabled ? 'Desactiver auto-completion' : 'Activer auto-completion'}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span>Auto</span>
        <div
          className={cn(
            'w-6 h-3.5 rounded-full transition-colors relative',
            autocompleteEnabled ? 'bg-violet-500/60' : 'bg-slate-600'
          )}
        >
          <div
            className={cn(
              'absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all',
              autocompleteEnabled ? 'right-0.5 bg-violet-200' : 'left-0.5 bg-slate-400'
            )}
          />
        </div>
      </button>

      {/* View mode toggle */}
      <button
        onClick={onToggleViewMode}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
          viewMode
            ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
            : 'text-slate-500 hover:bg-slate-700/50 hover:text-slate-400'
        )}
        title={viewMode ? 'Mode edition' : 'Mode lecture'}
      >
        {viewMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        <span>Vue</span>
      </button>

      {/* PDF Export (visible in view mode) */}
      {viewMode && onExportPdf && (
        <button
          onClick={onExportPdf}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-700/50 hover:text-slate-400 transition-colors"
          title="Exporter en PDF"
        >
          <FileDown className="w-3.5 h-3.5" />
          <span>PDF</span>
        </button>
      )}

      {/* Cell panel toggle */}
      <button
        onClick={onToggleCellPanel}
        className={cn(
          'p-1 rounded transition-colors',
          showCellPanel
            ? 'text-amber-400 bg-amber-500/10'
            : 'text-slate-500 hover:bg-slate-700/50 hover:text-slate-400'
        )}
        title="Panneau cellules"
      >
        <List className="w-4 h-4" />
      </button>

      {/* Search */}
      <button
        onClick={onToggleSearch}
        className="p-1 rounded text-slate-500 hover:bg-slate-700/50 hover:text-slate-400 transition-colors"
        title="Rechercher (Cmd+F)"
      >
        <Search className="w-4 h-4" />
      </button>

      <div className="flex-1" />

      {ipfsRunning && (
        <>
          <button
            onClick={onShareCID}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-cyan-400 hover:bg-cyan-500/20"
            title="Partager via CID (IPFS)"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-1 px-1.5 text-xs text-slate-500">
            <Users className="w-3 h-3" />
            <span>{peerCount}</span>
          </div>

          <div className="w-px h-5 bg-slate-700/50 mx-1" />
        </>
      )}

      <KernelStatus state={kernelState} />
    </div>
  );
}
