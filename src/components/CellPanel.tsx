import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Eye, EyeOff, Tag, Code, Type } from 'lucide-react';
import { cn } from '../utils/cn';
import type { Cell } from '../types';

interface CellPanelProps {
  cells: Cell[];
  hiddenCellIds: Set<string>;
  showCodeCellIds: Set<string>;
  onToggleHidden: (cellId: string) => void;
  onToggleShowCode: (cellId: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
  onUpdateLabel: (cellId: string, label: string) => void;
  onNavigateToCell: (cellId: string) => void;
  onClose: () => void;
}

export function CellPanel({
  cells,
  hiddenCellIds,
  showCodeCellIds,
  onToggleHidden,
  onToggleShowCode,
  onShowAll,
  onHideAll,
  onUpdateLabel,
  onNavigateToCell,
  onClose,
}: CellPanelProps) {
  const [panelWidth, setPanelWidth] = useState(280);
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resizing = useRef(false);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = panelWidth;

    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return;
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(200, Math.min(500, startW + delta)));
    };
    const onUp = () => {
      resizing.current = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [panelWidth]);

  const startEditing = useCallback((cellId: string, currentLabel: string) => {
    setEditingCellId(cellId);
    setEditValue(currentLabel);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const finishEditing = useCallback(() => {
    if (editingCellId) {
      onUpdateLabel(editingCellId, editValue.trim());
    }
    setEditingCellId(null);
    setEditValue('');
  }, [editingCellId, editValue, onUpdateLabel]);

  useEffect(() => {
    if (editingCellId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCellId]);

  return (
    <div
      className="shrink-0 border-l border-slate-700/50 bg-slate-900/95 flex flex-col"
      style={{ width: panelWidth }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500/30 z-10"
        onPointerDown={handleResizeStart}
        style={{ position: 'relative', width: 4, minWidth: 4, maxWidth: 4 }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 shrink-0">
        <Tag className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-sm font-medium text-slate-300 flex-1">Cellules</span>
        <button
          onClick={onShowAll}
          className="p-1 rounded text-slate-500 hover:text-emerald-400 hover:bg-slate-700/50"
          title="Tout montrer"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onHideAll}
          className="p-1 rounded text-slate-500 hover:text-slate-400 hover:bg-slate-700/50"
          title="Tout masquer"
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Cell list */}
      <div className="flex-1 overflow-y-auto">
        {cells.map((cell, index) => {
          const label = (cell.metadata?.label as string) || '';
          const isHidden = hiddenCellIds.has(cell.id);
          const isCodeShown = showCodeCellIds.has(cell.id);
          const isEditing = editingCellId === cell.id;
          const preview = label || cell.source.split('\n')[0]?.slice(0, 40) || '(vide)';

          return (
            <div
              key={cell.id}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-800/50 cursor-pointer hover:bg-slate-800/40 transition-colors',
                isHidden && 'opacity-50'
              )}
              onClick={() => onNavigateToCell(cell.id)}
            >
              {/* Index */}
              <span className="text-[10px] font-mono text-slate-600 w-5 text-right shrink-0">
                {index + 1}
              </span>

              {/* Type badge */}
              <span className={cn(
                'shrink-0',
                cell.cell_type === 'code' ? 'text-indigo-400' : 'text-emerald-400'
              )}>
                {cell.cell_type === 'code' ? <Code className="w-3 h-3" /> : <Type className="w-3 h-3" />}
              </span>

              {/* Label or preview */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={finishEditing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') finishEditing();
                      if (e.key === 'Escape') { setEditingCellId(null); setEditValue(''); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-slate-800 text-slate-200 text-[11px] px-1.5 py-0.5 rounded border border-slate-600 outline-none focus:border-amber-500/50"
                    placeholder="Label..."
                  />
                ) : (
                  <span
                    className={cn(
                      'text-[11px] truncate block',
                      label ? 'text-amber-300/80' : 'text-slate-500'
                    )}
                    onDoubleClick={(e) => { e.stopPropagation(); startEditing(cell.id, label); }}
                    title={label ? `Label: ${label} (double-clic pour editer)` : 'Double-clic pour ajouter un label'}
                  >
                    {label ? label : preview}
                  </span>
                )}
              </div>

              {/* Show code toggle (code cells only) */}
              {cell.cell_type === 'code' && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleShowCode(cell.id); }}
                  className={cn(
                    'p-0.5 rounded shrink-0',
                    isCodeShown
                      ? 'text-cyan-400 hover:text-cyan-300'
                      : 'text-slate-600 hover:text-slate-400'
                  )}
                  title={isCodeShown ? 'Masquer le code' : 'Afficher le code'}
                >
                  <Code className="w-3 h-3" />
                </button>
              )}

              {/* Visibility toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); onToggleHidden(cell.id); }}
                className={cn(
                  'p-0.5 rounded shrink-0',
                  isHidden
                    ? 'text-slate-600 hover:text-slate-400'
                    : 'text-slate-400 hover:text-emerald-400'
                )}
                title={isHidden ? 'Montrer' : 'Masquer'}
              >
                {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
