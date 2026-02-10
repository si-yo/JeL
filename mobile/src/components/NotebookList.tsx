import { FileText, RefreshCw, Plus, Users } from 'lucide-react';
import type { NotebookSummary } from '../services/wsBridge';
import type { CollabStatus } from '../App';

interface Props {
  notebooks: NotebookSummary[];
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onCreateNotebook: () => void;
  collabStatus: CollabStatus | null;
}

export function NotebookList({ notebooks, onSelect, onRefresh, onDisconnect, onCreateNotebook, collabStatus }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-800/80 border-b border-slate-700/50 shrink-0">
        <span className="text-sm font-medium text-slate-200 flex-1">Notebooks</span>
        {collabStatus?.active && collabStatus.peers.length > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px]">
            <Users className="w-3 h-3" />
            {collabStatus.peers.length}
          </span>
        )}
        <button
          onClick={onCreateNotebook}
          className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-500/20 text-indigo-400 text-xs"
          title="Nouveau notebook"
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau
        </button>
        <button
          onClick={onRefresh}
          className="p-1.5 rounded text-slate-500 hover:text-slate-300"
          title="Rafraichir"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <button
          onClick={onDisconnect}
          className="text-[11px] text-slate-500 hover:text-red-400 px-2 py-1"
        >
          Deconnecter
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3">
        {notebooks.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500">Aucun notebook ouvert</p>
            <p className="text-xs text-slate-600 mt-1">
              Ouvrez un notebook sur le desktop ou
            </p>
            <button
              onClick={onCreateNotebook}
              className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs border border-indigo-500/30"
            >
              <Plus className="w-4 h-4" />
              Creer un notebook
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {notebooks.map((nb) => (
              <button
                key={nb.id}
                onClick={() => onSelect(nb.id)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:bg-slate-800 transition-colors text-left"
              >
                <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-slate-200 block truncate">{nb.fileName}</span>
                  <span className="text-[10px] text-slate-500">{nb.cellCount} cellules</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
