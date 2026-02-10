import { cn } from '../utils/cn';
import { useStore } from '../store/useStore';
import { FilePlus, FolderOpen, X, FileText } from 'lucide-react';

export function Sidebar() {
  const notebooks = useStore((s) => s.notebooks);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const setActiveNotebook = useStore((s) => s.setActiveNotebook);
  const removeNotebook = useStore((s) => s.removeNotebook);
  const createNewNotebook = useStore((s) => s.createNewNotebook);

  const handleOpen = async () => {
    const result = await window.labAPI.dialog.openFile();
    if (result.canceled || result.filePaths.length === 0) return;

    const filePath = result.filePaths[0];
    const { parseNotebook } = await import('../utils/notebook');
    const { v4: uuidv4 } = await import('uuid');

    const fileResult = await window.labAPI.fs.readFile(filePath);
    if (!fileResult.success || !fileResult.data) return;

    const data = parseNotebook(fileResult.data);
    const fileName = filePath.split('/').pop() || 'notebook.ipynb';

    useStore.getState().addNotebook({
      id: uuidv4(),
      filePath,
      fileName,
      data,
      dirty: false,
      kernelId: null,
    });
  };

  return (
    <div className="w-56 shrink-0 flex flex-col border-r border-slate-700/50 bg-slate-900/50">
      {/* Titlebar drag area */}
      <div className="titlebar-drag h-10 flex items-center px-3 pl-20">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lab</span>
      </div>

      {/* Actions */}
      <div className="px-2 py-2 flex gap-1">
        <button
          onClick={() => createNewNotebook()}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <FilePlus className="w-3.5 h-3.5" />
          Nouveau
        </button>
        <button
          onClick={handleOpen}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Ouvrir
        </button>
      </div>

      {/* Notebook tabs */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {notebooks.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-8">Aucun notebook ouvert</p>
        )}
        {notebooks.map((nb) => (
          <div
            key={nb.id}
            className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs group transition-colors',
              nb.id === activeNotebookId
                ? 'bg-slate-700/60 text-slate-200'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
            )}
            onClick={() => setActiveNotebook(nb.id)}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">
              {nb.dirty && <span className="text-amber-400 mr-0.5">*</span>}
              {nb.fileName}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeNotebook(nb.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-600/50 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
