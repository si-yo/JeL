import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Check, X, Terminal, FileCode } from 'lucide-react';

export interface ShellCellInfo {
  id: string;
  index: number;
  source: string;
  label: string;
}

interface ShellConfirmModalProps {
  mode: 'command' | 'run';
  // command mode
  command?: string;
  isFromExternal?: boolean;
  // run mode
  cells?: ShellCellInfo[];
  selectedCellIds: Set<string>;
  onToggleCell?: (cellId: string) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  // common
  onAccept: () => void;
  onRefuse: () => void;
}

export function ShellConfirmModal({
  mode,
  command,
  isFromExternal,
  cells,
  selectedCellIds,
  onToggleCell,
  onSelectAll,
  onDeselectAll,
  onAccept,
  onRefuse,
}: ShellConfirmModalProps) {
  const [viewScript, setViewScript] = useState(false);

  // Build combined code preview for run mode
  const combinedCode = mode === 'run' && cells
    ? cells
        .filter((c) => selectedCellIds.has(c.id))
        .map((c) => c.source)
        .join('\n\n')
    : '';

  const hasSelection = selectedCellIds.size > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              Executer un programme externe
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {mode === 'run'
                ? 'Assembler et executer les cellules comme un script Python'
                : 'Cette cellule va executer une commande systeme'}
            </p>
          </div>
          {isFromExternal && (
            <span className="ml-auto px-2 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 font-medium">
              Import externe
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {mode === 'command' && command && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-900/60 border border-slate-700/50">
              <Terminal className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
              <code className="text-sm text-blue-300 font-mono break-all">{command}</code>
            </div>
          )}

          {mode === 'run' && cells && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Selectionnez les cellules a inclure :
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={onSelectAll}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Tout
                  </button>
                  <button
                    onClick={onDeselectAll}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Aucun
                  </button>
                </div>
              </div>

              <div className="space-y-1 max-h-48 overflow-y-auto">
                {cells.map((c) => {
                  const selected = selectedCellIds.has(c.id);
                  const firstLine = c.source.split('\n')[0].slice(0, 60);
                  return (
                    <button
                      key={c.id}
                      onClick={() => onToggleCell?.(c.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors ${
                        selected
                          ? 'bg-blue-500/10 border border-blue-500/30'
                          : 'bg-slate-900/40 border border-slate-700/30 opacity-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        selected ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                      }`}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-[10px] text-slate-500 w-6 shrink-0">
                        [{c.index + 1}]
                      </span>
                      {c.label && (
                        <span className="text-[10px] text-violet-400 shrink-0">
                          {c.label}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 font-mono truncate">
                        {firstLine || '(vide)'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Script preview toggle */}
          {mode === 'run' && (
            <button
              onClick={() => setViewScript((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {viewScript ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <FileCode className="w-3.5 h-3.5" />
              {viewScript ? 'Masquer le script' : 'Voir le script'}
            </button>
          )}

          {viewScript && combinedCode && (
            <pre className="p-3 rounded-lg bg-slate-900 border border-slate-700/50 text-xs text-slate-300 font-mono overflow-x-auto max-h-60 whitespace-pre-wrap">
              {combinedCode}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700">
          <button
            onClick={onRefuse}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Refuser
          </button>
          <button
            onClick={onAccept}
            disabled={mode === 'run' && !hasSelection}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" />
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
