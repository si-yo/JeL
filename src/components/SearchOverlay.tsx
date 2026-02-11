import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Search, FileText, Code } from 'lucide-react';
import { cn } from '../utils/cn';
import type { OpenNotebook } from '../types';

interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

interface CellSearchResult {
  cellId: string;
  cellIndex: number;
  cellType: 'code' | 'markdown';
  matches: SearchMatch[];
}

interface NotebookSearchResult {
  notebookId: string;
  notebookName: string;
  cells: CellSearchResult[];
  totalMatches: number;
}

interface SearchOverlayProps {
  notebooks: OpenNotebook[];
  onNavigate: (notebookId: string, cellId: string) => void;
  onClose: () => void;
}

function searchInNotebooks(
  query: string,
  notebooks: OpenNotebook[],
  caseSensitive: boolean,
  useRegex: boolean,
): NotebookSearchResult[] {
  if (!query.trim()) return [];

  const results: NotebookSearchResult[] = [];

  let regex: RegExp;
  try {
    regex = useRegex
      ? new RegExp(query, caseSensitive ? 'g' : 'gi')
      : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  } catch {
    return [];
  }

  for (const nb of notebooks) {
    const cellResults: CellSearchResult[] = [];

    for (let i = 0; i < nb.data.cells.length; i++) {
      const cell = nb.data.cells[i];
      const lines = cell.source.split('\n');
      const matches: SearchMatch[] = [];

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        regex.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(line)) !== null) {
          matches.push({
            lineNumber: lineIdx + 1,
            lineContent: line,
            matchStart: m.index,
            matchEnd: m.index + m[0].length,
          });
          if (!regex.global) break;
        }
      }

      if (matches.length > 0) {
        cellResults.push({
          cellId: cell.id,
          cellIndex: i,
          cellType: cell.cell_type,
          matches,
        });
      }
    }

    if (cellResults.length > 0) {
      results.push({
        notebookId: nb.id,
        notebookName: nb.fileName,
        cells: cellResults,
        totalMatches: cellResults.reduce((sum, cr) => sum + cr.matches.length, 0),
      });
    }
  }

  return results;
}

function HighlightedLine({ line, matchStart, matchEnd }: { line: string; matchStart: number; matchEnd: number }) {
  const before = line.substring(0, matchStart);
  const match = line.substring(matchStart, matchEnd);
  const after = line.substring(matchEnd);
  // Truncate long lines for display
  const maxCtx = 40;
  const displayBefore = before.length > maxCtx ? '...' + before.slice(-maxCtx) : before;
  const displayAfter = after.length > maxCtx ? after.slice(0, maxCtx) + '...' : after;

  return (
    <span className="font-mono text-[11px]">
      <span className="text-slate-500">{displayBefore}</span>
      <span className="bg-amber-500/30 text-amber-200 rounded-sm px-0.5">{match}</span>
      <span className="text-slate-500">{displayAfter}</span>
    </span>
  );
}

export function SearchOverlay({ notebooks, onNavigate, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on click outside
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const results = useMemo(
    () => searchInNotebooks(query, notebooks, caseSensitive, useRegex),
    [query, notebooks, caseSensitive, useRegex],
  );

  const totalMatches = results.reduce((sum, r) => sum + r.totalMatches, 0);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[15vh]"
      onClick={handleBackdropClick}
    >
      <div
        ref={overlayRef}
        className="w-full max-w-2xl bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans les notebooks..."
            className="flex-1 bg-transparent text-slate-200 text-sm outline-none placeholder:text-slate-600"
          />
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-mono border',
              caseSensitive
                ? 'border-amber-500/50 text-amber-300 bg-amber-500/10'
                : 'border-slate-700 text-slate-600 hover:text-slate-400'
            )}
            title="Sensible a la casse"
          >
            Aa
          </button>
          <button
            onClick={() => setUseRegex((v) => !v)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-mono border',
              useRegex
                ? 'border-violet-500/50 text-violet-300 bg-violet-500/10'
                : 'border-slate-700 text-slate-600 hover:text-slate-400'
            )}
            title="Expression reguliere"
          >
            .*
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {query.trim() && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-slate-600">
              Aucun resultat
            </div>
          )}

          {!query.trim() && (
            <div className="px-4 py-8 text-center text-sm text-slate-600">
              Tapez pour rechercher dans {notebooks.length} notebook{notebooks.length > 1 ? 's' : ''}
            </div>
          )}

          {results.length > 0 && (
            <div className="px-2 py-1 text-[10px] text-slate-600 border-b border-slate-800">
              {totalMatches} resultat{totalMatches > 1 ? 's' : ''} dans {results.length} notebook{results.length > 1 ? 's' : ''}
            </div>
          )}

          {results.map((nbResult) => (
            <div key={nbResult.notebookId}>
              {/* Notebook header */}
              <div className="px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800/30 border-b border-slate-800/50 flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-slate-500" />
                {nbResult.notebookName}
                <span className="text-slate-600 ml-auto">{nbResult.totalMatches}</span>
              </div>

              {/* Cell matches */}
              {nbResult.cells.map((cellResult) => (
                <div key={cellResult.cellId}>
                  {cellResult.matches.slice(0, 5).map((match, mi) => (
                    <div
                      key={mi}
                      className="px-3 py-1 flex items-center gap-2 cursor-pointer hover:bg-slate-800/50 border-b border-slate-800/30"
                      onClick={() => { onNavigate(nbResult.notebookId, cellResult.cellId); onClose(); }}
                    >
                      <span className={cn(
                        'shrink-0',
                        cellResult.cellType === 'code' ? 'text-indigo-400' : 'text-emerald-400'
                      )}>
                        {cellResult.cellType === 'code' ? <Code className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                      </span>
                      <span className="text-[10px] text-slate-600 font-mono w-6 text-right shrink-0">
                        {cellResult.cellIndex + 1}:{match.lineNumber}
                      </span>
                      <div className="flex-1 min-w-0 truncate">
                        <HighlightedLine
                          line={match.lineContent}
                          matchStart={match.matchStart}
                          matchEnd={match.matchEnd}
                        />
                      </div>
                    </div>
                  ))}
                  {cellResult.matches.length > 5 && (
                    <div className="px-3 py-0.5 text-[10px] text-slate-600 italic">
                      +{cellResult.matches.length - 5} autres
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
