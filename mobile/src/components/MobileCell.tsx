import { useState, useRef, useEffect, useMemo } from 'react';
import { Play, FileText, Code, Loader2, Trash2, ArrowUp, ArrowDown, RefreshCw, Plus } from 'lucide-react';
import type { CellData } from '../services/wsBridge';
import { MobileCellOutputView } from './MobileCellOutput';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  cell: CellData;
  notebookId: string;
  index: number;
  totalCells: number;
  running: boolean;
  viewMode?: boolean;
  onUpdateSource: (source: string) => void;
  onRun: () => void;
  onDelete: () => void;
  onToggleType: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddCellAfter: (type: 'code' | 'markdown') => void;
}

export function MobileCell({ cell, index, totalCells, running, viewMode, onUpdateSource, onRun, onDelete, onToggleType, onMoveUp, onMoveDown, onAddCellAfter }: Props) {
  const [editing, setEditing] = useState(false);
  const [localSource, setLocalSource] = useState(cell.source);
  const [showActions, setShowActions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalSource(cell.source);
  }, [cell.source]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing, localSource]);

  const handleBlur = () => {
    setEditing(false);
    if (localSource !== cell.source) {
      onUpdateSource(localSource);
    }
  };

  const isCode = cell.cell_type === 'code';
  const hasOutput = cell.outputs.length > 0;

  const renderedMarkdown = useMemo(() => {
    if (cell.cell_type !== 'markdown' || !cell.source) return '';
    return marked.parse(cell.source) as string;
  }, [cell.cell_type, cell.source]);

  // In view mode, hide empty cells and code cells with no output
  if (viewMode) {
    const isEmpty = !cell.source.trim();
    if (isCode && isEmpty && !hasOutput) return null;
    if (!isCode && isEmpty) return null;
  }

  return (
    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
      {/* Cell header — hidden in view mode */}
      {!viewMode && (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 border-b border-slate-700/30">
        <button
          onClick={onToggleType}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300"
          title="Changer le type"
        >
          {isCode ? (
            <Code className="w-3 h-3 text-indigo-400" />
          ) : (
            <FileText className="w-3 h-3 text-emerald-400" />
          )}
          {isCode ? 'Code' : 'Md'}
        </button>
        {cell.execution_count != null && (
          <span className="text-[10px] text-slate-600">[{cell.execution_count}]</span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {/* Action toggle */}
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-1 rounded text-slate-600 hover:text-slate-400"
            title="Actions"
          >
            <span className="text-[10px]">...</span>
          </button>
          {isCode && (
            <button
              onClick={onRun}
              disabled={running}
              className="p-1 rounded text-slate-500 hover:text-emerald-400 disabled:opacity-40"
            >
              {running ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
      )}

      {/* Actions bar — hidden in view mode */}
      {!viewMode && showActions && (
        <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 border-b border-slate-700/30">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30"
            title="Monter"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === totalCells - 1}
            className="p-1 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30"
            title="Descendre"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleType}
            className="p-1 rounded text-slate-500 hover:text-slate-300"
            title="Changer type"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onAddCellAfter('code')}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-slate-500 hover:text-indigo-400"
          >
            <Plus className="w-3 h-3" />
            Code
          </button>
          <button
            onClick={() => onAddCellAfter('markdown')}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-slate-500 hover:text-emerald-400"
          >
            <Plus className="w-3 h-3" />
            Md
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded text-slate-500 hover:text-red-400 ml-auto"
            title="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Cell source — hidden in view mode */}
      {!viewMode && (
        editing ? (
          <textarea
            ref={textareaRef}
            value={localSource}
            onChange={(e) => setLocalSource(e.target.value)}
            onBlur={handleBlur}
            className="cell-source w-full bg-slate-900 text-slate-200 px-3 py-2 outline-none border-none min-h-[40px]"
            autoFocus
          />
        ) : (
          <div
            onClick={() => setEditing(true)}
            className="px-3 py-2 min-h-[40px] cursor-text"
          >
            {cell.source ? (
              <pre className="text-[13px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                {cell.source}
              </pre>
            ) : (
              <span className="text-[11px] text-slate-600 italic">Touchez pour editer</span>
            )}
          </div>
        )
      )}

      {/* Markdown rendered preview in view mode */}
      {viewMode && !isCode && cell.source && (
        <div
          className="markdown-body px-3 py-2"
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      )}

      {/* Cell outputs */}
      {hasOutput && (
        <div className={viewMode ? '' : 'border-t border-slate-700/30 bg-slate-950/40'}>
          <MobileCellOutputView outputs={cell.outputs} />
        </div>
      )}
    </div>
  );
}
