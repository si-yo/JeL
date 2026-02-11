import { useEffect, useState, useCallback } from 'react';
import { useHistoryStore, type RedoBranchOption } from '../store/useHistoryStore';
import { GitBranch, X, ArrowRight, Plus, Trash2, Edit3, Move, RefreshCw } from 'lucide-react';
import type { CellSnapshot } from '../services/historyTypes';

interface DiffEntry {
  type: 'added' | 'deleted' | 'modified';
  cellId: string;
  preview: string;
  prevPreview?: string;
}

function computeDiff(current: CellSnapshot[], child: CellSnapshot[]): DiffEntry[] {
  const currentMap = new Map(current.map((c) => [c.id, c]));
  const childMap = new Map(child.map((c) => [c.id, c]));
  const entries: DiffEntry[] = [];

  for (const [id, cell] of childMap) {
    if (!currentMap.has(id)) {
      entries.push({ type: 'added', cellId: id, preview: cell.source.slice(0, 120) });
    }
  }
  for (const [id, cell] of currentMap) {
    if (!childMap.has(id)) {
      entries.push({ type: 'deleted', cellId: id, preview: cell.source.slice(0, 120) });
    }
  }
  for (const [id, cell] of childMap) {
    const prev = currentMap.get(id);
    if (prev && prev.source !== cell.source) {
      entries.push({
        type: 'modified',
        cellId: id,
        preview: cell.source.slice(0, 120),
        prevPreview: prev.source.slice(0, 120),
      });
    }
  }
  return entries;
}

function actionLabel(action: RedoBranchOption['action']): string {
  switch (action.type) {
    case 'cell-update': return 'Modification';
    case 'cell-add': return 'Ajout cellule';
    case 'cell-delete': return 'Suppression cellule';
    case 'cell-move': return `Deplacement ${action.direction === 'up' ? '↑' : '↓'}`;
    case 'cell-type-change': return 'Changement de type';
    case 'init': return 'Initialisation';
    default: return 'Action';
  }
}

function actionIcon(type: string) {
  switch (type) {
    case 'cell-update': return <Edit3 className="w-3 h-3" />;
    case 'cell-add': return <Plus className="w-3 h-3" />;
    case 'cell-delete': return <Trash2 className="w-3 h-3" />;
    case 'cell-move': return <Move className="w-3 h-3" />;
    case 'cell-type-change': return <RefreshCw className="w-3 h-3" />;
    default: return <ArrowRight className="w-3 h-3" />;
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'il y a quelques secondes';
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `il y a ${Math.floor(diff / 3_600_000)}h`;
  return new Date(ts).toLocaleString();
}

interface RedoBranchPickerProps {
  currentCells: CellSnapshot[];
  onSelect: (nodeId: string) => void;
  onCancel: () => void;
}

export function RedoBranchPicker({ currentCells, onSelect, onCancel }: RedoBranchPickerProps) {
  const pending = useHistoryStore((s) => s.pendingRedoBranches);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const options = pending?.options ?? [];

  const handleSelect = useCallback(
    (idx: number) => {
      if (options[idx]) onSelect(options[idx].nodeId);
    },
    [options, onSelect],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIdx((i) => (i > 0 ? i - 1 : options.length - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIdx((i) => (i < options.length - 1 ? i + 1 : 0));
          break;
        case 'Enter':
        case 'Space':
          e.preventDefault();
          handleSelect(selectedIdx);
          break;
        case 'Escape':
          e.preventDefault();
          onCancel();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIdx, options.length, handleSelect, onCancel]);

  if (!pending || options.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Panel */}
      <div className="relative bg-slate-900 border border-slate-700/50 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-medium text-slate-200">Choisir une branche</span>
            <span className="text-[10px] text-slate-500 ml-1">
              {options.length} branche{options.length > 1 ? 's' : ''}
            </span>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {options.map((opt, idx) => {
            const diffs = computeDiff(currentCells, opt.cells);
            const isSelected = idx === selectedIdx;

            return (
              <button
                key={opt.nodeId}
                onClick={() => handleSelect(idx)}
                onMouseEnter={() => setSelectedIdx(idx)}
                className={`w-full text-left rounded-lg border p-3 transition-all duration-150 ${
                  isSelected
                    ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'border-slate-700/30 bg-slate-800/40 hover:border-slate-600/50'
                }`}
              >
                {/* Action header */}
                <div className="flex items-center gap-2 mb-2">
                  <span className={`flex items-center gap-1 text-[11px] font-medium ${isSelected ? 'text-indigo-300' : 'text-slate-300'}`}>
                    {actionIcon(opt.action.type)}
                    {actionLabel(opt.action)}
                  </span>
                  <span className="text-[10px] text-slate-500">{relativeTime(opt.timestamp)}</span>
                  {opt.peerName && (
                    <span className="text-[10px] text-cyan-400 ml-auto">par {opt.peerName}</span>
                  )}
                </div>

                {/* Diffs */}
                {diffs.length > 0 ? (
                  <div className="space-y-1">
                    {diffs.slice(0, 4).map((d, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span
                          className={`text-[10px] font-mono shrink-0 mt-0.5 ${
                            d.type === 'added'
                              ? 'text-emerald-400'
                              : d.type === 'deleted'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {d.type === 'added' ? '+' : d.type === 'deleted' ? '-' : '~'}
                        </span>
                        <code className="text-[10px] text-slate-400 font-mono truncate block">
                          {d.type === 'modified' && d.prevPreview
                            ? d.preview
                            : d.preview}
                        </code>
                      </div>
                    ))}
                    {diffs.length > 4 && (
                      <span className="text-[10px] text-slate-600">
                        +{diffs.length - 4} autre{diffs.length - 4 > 1 ? 's' : ''} changement{diffs.length - 4 > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-500 italic">Pas de changement visible</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-700/30 text-[10px] text-slate-600">
          ↑↓ pour naviguer &middot; Enter/Space pour valider &middot; Escape pour annuler
        </div>
      </div>
    </div>
  );
}
