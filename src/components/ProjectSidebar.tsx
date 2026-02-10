import { useState } from 'react';
import { cn } from '../utils/cn';
import { useStore } from '../store/useStore';
import {
  FilePlus, FolderOpen, FolderPlus, X, FileText, Star, StarOff,
  ChevronDown, ChevronRight, Users, Wifi, WifiOff, Share2,
} from 'lucide-react';
import { PeerPanel } from './PeerPanel';

export function ProjectSidebar() {
  const notebooks = useStore((s) => s.notebooks);
  const activeNotebookId = useStore((s) => s.activeNotebookId);
  const setActiveNotebook = useStore((s) => s.setActiveNotebook);
  const removeNotebook = useStore((s) => s.removeNotebook);
  const createNewNotebook = useStore((s) => s.createNewNotebook);
  const currentProject = useStore((s) => s.currentProject);
  const setCurrentProject = useStore((s) => s.setCurrentProject);
  const favoriteProjects = useStore((s) => s.favoriteProjects);
  const addFavorite = useStore((s) => s.addFavorite);
  const removeFavorite = useStore((s) => s.removeFavorite);
  const ipfsRunning = useStore((s) => s.ipfsRunning);
  const peers = useStore((s) => s.peers);

  const [showFavorites, setShowFavorites] = useState(true);
  const [showPeers, setShowPeers] = useState(true);
  const [showNotebooks, setShowNotebooks] = useState(true);

  const handleOpenNotebook = async () => {
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

  const handleNewProject = async () => {
    const result = await window.labAPI.dialog.openDirectory();
    if (result.canceled || result.filePaths.length === 0) return;

    const dirPath = result.filePaths[0];
    const name = dirPath.split('/').pop() || 'projet';

    const createResult = await window.labAPI.project.create({ name, dirPath });
    if (createResult.success && createResult.project) {
      setCurrentProject(createResult.project);
      addFavorite({
        path: dirPath,
        name,
        lastOpened: new Date().toISOString(),
      });
    }
  };

  const handleOpenProject = async () => {
    const result = await window.labAPI.dialog.openDirectory();
    if (result.canceled || result.filePaths.length === 0) return;
    await openProjectPath(result.filePaths[0]);
  };

  const openProjectPath = async (dirPath: string) => {
    const openResult = await window.labAPI.project.open(dirPath);
    if (openResult.success && openResult.project) {
      setCurrentProject(openResult.project);
      useStore.getState().setJupyterRunning(false); // Jupyter stopped during project switch
      addFavorite({
        path: dirPath,
        name: openResult.project.name,
        lastOpened: new Date().toISOString(),
      });
    }
  };

  const handleOpenProjectNotebook = async (relativePath: string) => {
    if (!currentProject) return;
    const filePath = `${currentProject.path}/${relativePath}`;

    // Check if already open
    const existing = notebooks.find((n) => n.filePath === filePath);
    if (existing) {
      setActiveNotebook(existing.id);
      return;
    }

    const { parseNotebook } = await import('../utils/notebook');
    const { v4: uuidv4 } = await import('uuid');

    const fileResult = await window.labAPI.fs.readFile(filePath);
    if (!fileResult.success || !fileResult.data) return;

    const data = parseNotebook(fileResult.data);
    const fileName = relativePath.split('/').pop() || 'notebook.ipynb';

    useStore.getState().addNotebook({
      id: uuidv4(),
      filePath,
      fileName,
      data,
      dirty: false,
      kernelId: null,
    });
  };

  const isFavorite = currentProject
    ? favoriteProjects.some((f) => f.path === currentProject.path)
    : false;

  return (
    <div className="w-60 shrink-0 flex flex-col border-r border-slate-700/50 bg-slate-900/50 overflow-hidden">
      {/* Titlebar drag area */}
      <div className="titlebar-drag h-10 flex items-center px-3 pl-20">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lab</span>
      </div>

      {/* Project header */}
      {currentProject ? (
        <div className="px-3 py-2 border-b border-slate-700/30">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="text-xs font-medium text-slate-200 truncate flex-1">
              {currentProject.name}
            </span>
            <button
              onClick={() => {
                if (!currentProject) return;
                if (isFavorite) {
                  removeFavorite(currentProject.path);
                } else {
                  addFavorite({
                    path: currentProject.path,
                    name: currentProject.name,
                    lastOpened: new Date().toISOString(),
                  });
                }
              }}
              className="p-0.5 text-slate-500 hover:text-amber-400"
              title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              {isFavorite ? <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> : <Star className="w-3 h-3" />}
            </button>
            <button
              onClick={async () => {
                await window.labAPI.project.close();
                setCurrentProject(null);
              }}
              className="p-0.5 text-slate-500 hover:text-slate-300"
              title="Fermer projet"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="text-[10px] text-slate-600 mt-0.5 truncate">{currentProject.path}</div>
        </div>
      ) : (
        <div className="px-2 py-2 flex gap-1">
          <button
            onClick={handleNewProject}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Projet
          </button>
          <button
            onClick={handleOpenProject}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Ouvrir
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Favorites */}
        {!currentProject && favoriteProjects.length > 0 && (
          <div className="px-1 py-1">
            <button
              onClick={() => setShowFavorites(!showFavorites)}
              className="flex items-center gap-1 px-2 py-1 w-full text-[10px] text-slate-500 uppercase tracking-wider hover:text-slate-400"
            >
              {showFavorites ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Favoris
            </button>
            {showFavorites &&
              favoriteProjects.map((fav) => (
                <div
                  key={fav.path}
                  className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs text-slate-400 hover:bg-slate-800/60 hover:text-slate-300 group"
                  onClick={() => openProjectPath(fav.path)}
                >
                  <Star className="w-3 h-3 text-amber-500/60 shrink-0" />
                  <span className="truncate flex-1">{fav.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFavorite(fav.path);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-600 hover:text-red-400"
                  >
                    <StarOff className="w-3 h-3" />
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* Project notebooks */}
        {currentProject && (
          <div className="px-1 py-1">
            <button
              onClick={() => setShowNotebooks(!showNotebooks)}
              className="flex items-center gap-1 px-2 py-1 w-full text-[10px] text-slate-500 uppercase tracking-wider hover:text-slate-400"
            >
              {showNotebooks ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Notebooks ({currentProject.notebooks.length})
            </button>
            {showNotebooks && (
              <>
                {currentProject.notebooks.map((nb) => (
                  <div
                    key={nb}
                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs text-slate-400 hover:bg-slate-800/60 hover:text-slate-300"
                    onClick={() => handleOpenProjectNotebook(nb)}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{nb}</span>
                  </div>
                ))}
                <button
                  onClick={() => createNewNotebook()}
                  className="flex items-center gap-1.5 px-2 py-1.5 w-full rounded text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
                >
                  <FilePlus className="w-3.5 h-3.5" />
                  Nouveau notebook
                </button>
              </>
            )}
          </div>
        )}

        {/* Open tabs */}
        <div className="px-1 py-1">
          <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-slate-500 uppercase tracking-wider">
            Ouverts ({notebooks.length})
          </div>
          {notebooks.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-4">Aucun notebook ouvert</p>
          )}
          {notebooks.map((nb) => (
            <div
              key={nb.id}
              className={cn(
                'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs group transition-colors',
                nb.id === activeNotebookId
                  ? nb.dirty
                    ? 'bg-orange-500/10 text-orange-300'
                    : 'bg-slate-700/60 text-slate-200'
                  : nb.dirty
                    ? 'text-orange-400/80 hover:bg-orange-500/10 hover:text-orange-300'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
              )}
              onClick={() => setActiveNotebook(nb.id)}
            >
              <FileText className={cn('w-3.5 h-3.5 shrink-0', nb.dirty && 'text-orange-400')} />
              <span className="truncate flex-1">
                {nb.dirty && <span className="text-orange-400 mr-0.5">*</span>}
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

          {!currentProject && (
            <div className="px-2 py-1 flex gap-1">
              <button
                onClick={() => createNewNotebook()}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
              >
                <FilePlus className="w-3 h-3" />
                Nouveau
              </button>
              <button
                onClick={handleOpenNotebook}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800/40"
              >
                <FolderOpen className="w-3 h-3" />
                Ouvrir
              </button>
            </div>
          )}
        </div>

        {/* Peers */}
        <div className="px-1 py-1">
          <button
            onClick={() => setShowPeers(!showPeers)}
            className="flex items-center gap-1 px-2 py-1 w-full text-[10px] text-slate-500 uppercase tracking-wider hover:text-slate-400"
          >
            {showPeers ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <Users className="w-3 h-3" />
            Reseau
            {ipfsRunning ? (
              <Wifi className="w-3 h-3 text-emerald-500 ml-auto" />
            ) : (
              <WifiOff className="w-3 h-3 text-slate-600 ml-auto" />
            )}
          </button>
          {showPeers && <PeerPanel />}
        </div>
      </div>
    </div>
  );
}
