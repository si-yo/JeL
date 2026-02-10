import { useMemo, useRef } from 'react';
import { cn } from '../utils/cn';
import { CellEditor, focusCellEditor } from './CellEditor';
import { CellOutputView } from './CellOutput';
import type { Cell as CellType } from '../types';
import { Play, Trash2, ChevronUp, ChevronDown, Code, Type } from 'lucide-react';
import { marked } from 'marked';
import { getPeerColor } from '../utils/peerColors';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

export interface RemotePeerInfo {
  peerId: string;
  peerName?: string;
}

interface CellProps {
  cell: CellType;
  index: number;
  isActive: boolean;
  isRunning: boolean;
  isSelected: boolean;
  autocompleteEnabled: boolean;
  remotePeers?: RemotePeerInfo[];
  onCellClick: (e: React.MouseEvent) => void;
  onSourceChange: (source: string) => void;
  onRun: () => void;
  onRunAndInsert: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleType: () => void;
  onFocusUp: () => void;
  onFocusDown: () => void;
}

export function Cell({
  cell,
  index,
  isActive,
  isRunning,
  isSelected,
  autocompleteEnabled,
  remotePeers,
  onCellClick,
  onSourceChange,
  onRun,
  onRunAndInsert,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleType,
  onFocusUp,
  onFocusDown,
}: CellProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const renderedMarkdown = useMemo(() => {
    if (cell.cell_type !== 'markdown' || !cell.source) return '';
    return marked.parse(cell.source) as string;
  }, [cell.cell_type, cell.source]);

  const execLabel =
    cell.cell_type === 'code'
      ? cell.execution_count !== null
        ? `[${cell.execution_count}]`
        : isRunning
        ? '[*]'
        : '[ ]'
      : '';

  const hasPeers = remotePeers && remotePeers.length > 0;
  const primaryPeerColor = hasPeers ? getPeerColor(remotePeers[0].peerId) : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative rounded-lg transition-colors mb-2',
        hasPeers ? 'border-l-[3px]' : 'border',
        isSelected && isActive
          ? 'border-indigo-500/60 bg-slate-800/50 ring-2 ring-cyan-500/30'
          : isSelected
          ? 'border-cyan-500/50 bg-cyan-950/20'
          : isActive
          ? hasPeers ? 'border border-l-[3px] bg-slate-800/50' : 'border-indigo-500/60 bg-slate-800/50'
          : hasPeers ? 'border border-l-[3px] bg-slate-800/20 hover:border-slate-600/60' : 'border-slate-700/40 bg-slate-800/20 hover:border-slate-600/60'
      )}
      style={hasPeers && !isSelected ? {
        borderLeftColor: primaryPeerColor!.border,
        borderTopColor: undefined,
        borderRightColor: undefined,
        borderBottomColor: undefined,
        boxShadow: `inset 3px 0 12px -4px ${primaryPeerColor!.bg}`,
      } : undefined}
      onClick={onCellClick}
    >
      {/* Cell header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-700/30">
        {/* Execution count */}
        <span className="text-xs font-mono text-slate-500 w-10 text-right shrink-0">
          {execLabel}
        </span>

        {/* Cell type badge */}
        <span
          className={cn(
            'text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded',
            cell.cell_type === 'code'
              ? 'bg-indigo-500/20 text-indigo-400'
              : 'bg-emerald-500/20 text-emerald-400'
          )}
        >
          {cell.cell_type}
        </span>

        {/* Remote peer cursors */}
        {hasPeers && (
          <div className="flex items-center gap-1.5">
            {remotePeers.map((rp) => {
              const color = getPeerColor(rp.peerId);
              return (
                <span
                  key={rp.peerId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
                  style={{
                    backgroundColor: color.bg,
                    borderColor: color.border,
                    color: color.text,
                  }}
                  title={rp.peerName || rp.peerId.slice(0, 12)}
                >
                  <span
                    className="w-2 h-2 rounded-full animate-pulse shrink-0"
                    style={{ backgroundColor: color.dot }}
                  />
                  {rp.peerName || rp.peerId.slice(0, 8)}
                </span>
              );
            })}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions (visible on hover or active) */}
        <div
          className={cn(
            'flex items-center gap-1 transition-opacity',
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onRun(); }}
            className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-emerald-400"
            title={cell.cell_type === 'code' ? 'Executer (Shift+Enter)' : 'Afficher (Shift+Enter)'}
          >
            <Play className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggleType(); }}
            className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-slate-200"
            title="Changer type"
          >
            {cell.cell_type === 'code' ? <Type className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-slate-200"
            title="Monter"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-slate-200"
            title="Descendre"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-red-400"
            title="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="px-1">
        <CellEditor
          source={cell.source}
          cellType={cell.cell_type}
          autocompleteEnabled={autocompleteEnabled}
          onChange={onSourceChange}
          onRun={onRun}
          onRunAndInsert={onRunAndInsert}
          onFocusUp={onFocusUp}
          onFocusDown={onFocusDown}
          autoFocus={isActive}
        />
      </div>

      {/* Outputs */}
      {cell.cell_type === 'code' && (
        <CellOutputView outputs={cell.outputs} />
      )}

      {/* Markdown rendered preview */}
      {cell.cell_type === 'markdown' && cell.source && !isActive && (
        <div
          className="markdown-body px-4 py-3"
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      )}
    </div>
  );
}
