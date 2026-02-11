import { useState } from 'react';
import { X, FileDown, FileText, Link2, FolderOpen } from 'lucide-react';
import { cn } from '../utils/cn';

export type ExportScope = 'single' | 'linked' | 'project';

interface ExportPdfDialogProps {
  notebookName: string;
  hasLinkedNotebooks: boolean;
  hasProject: boolean;
  onExport: (scope: ExportScope) => void;
  onClose: () => void;
}

export function ExportPdfDialog({
  notebookName,
  hasLinkedNotebooks,
  hasProject,
  onExport,
  onClose,
}: ExportPdfDialogProps) {
  const [scope, setScope] = useState<ExportScope>('single');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    onExport(scope);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 rounded-xl border border-slate-700/50 shadow-2xl w-[380px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
          <FileDown className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-200 flex-1">Exporter en PDF</span>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scope options */}
        <div className="p-4 space-y-2">
          {/* Single notebook */}
          <button
            onClick={() => setScope('single')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
              scope === 'single'
                ? 'border-indigo-500/50 bg-indigo-500/10 text-slate-200'
                : 'border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-slate-600/50 hover:text-slate-300'
            )}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-sm font-medium">Notebook actif</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{notebookName}</div>
            </div>
          </button>

          {/* Linked notebooks */}
          <button
            onClick={() => hasLinkedNotebooks && setScope('linked')}
            disabled={!hasLinkedNotebooks}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
              !hasLinkedNotebooks && 'opacity-40 cursor-not-allowed',
              scope === 'linked'
                ? 'border-indigo-500/50 bg-indigo-500/10 text-slate-200'
                : 'border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-slate-600/50 hover:text-slate-300'
            )}
          >
            <Link2 className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-sm font-medium">Notebooks lies</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {hasLinkedNotebooks ? 'Notebook actif + notebooks references par liens' : 'Aucun lien .ipynb detecte'}
              </div>
            </div>
          </button>

          {/* Project */}
          <button
            onClick={() => hasProject && setScope('project')}
            disabled={!hasProject}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
              !hasProject && 'opacity-40 cursor-not-allowed',
              scope === 'project'
                ? 'border-indigo-500/50 bg-indigo-500/10 text-slate-200'
                : 'border-slate-700/50 bg-slate-800/50 text-slate-400 hover:border-slate-600/50 hover:text-slate-300'
            )}
          >
            <FolderOpen className="w-4 h-4 shrink-0" />
            <div>
              <div className="text-sm font-medium">Projet entier</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {hasProject ? 'Tous les notebooks ouverts' : 'Pas de projet ouvert'}
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-700/50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-700/50"
          >
            Annuler
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" />
            {exporting ? 'Export...' : 'Exporter'}
          </button>
        </div>
      </div>
    </div>
  );
}
