import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, Package, Loader2, RefreshCw } from 'lucide-react';

interface PipPackage {
  name: string;
  version: string;
}

interface Props {
  onClose: () => void;
}

export function PipPanel({ onClose }: Props) {
  const [input, setInput] = useState('');
  const [installing, setInstalling] = useState(false);
  const [output, setOutput] = useState('');
  const [packages, setPackages] = useState<PipPackage[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [tab, setTab] = useState<'install' | 'list'>('install');
  const [filter, setFilter] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);

  // Load package list
  const loadPackages = useCallback(async () => {
    setLoadingList(true);
    const result = await window.labAPI.pip.list();
    if (result.success && result.packages) {
      setPackages(result.packages);
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // Listen for pip output stream
  useEffect(() => {
    const cleanup = window.labAPI.pip.onOutput(({ text }) => {
      setOutput((prev) => prev + text);
      // Auto-scroll
      requestAnimationFrame(() => {
        if (outputRef.current) {
          outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
      });
    });
    return cleanup;
  }, []);

  const handleInstall = async () => {
    if (!input.trim() || installing) return;
    setInstalling(true);
    setOutput('');
    setTab('install');
    const result = await window.labAPI.pip.install({ packages: input.trim() });
    setInstalling(false);
    if (result.success) {
      setInput('');
      // Refresh the list
      loadPackages();
    }
  };

  const filteredPackages = filter
    ? packages.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
    : packages;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[480px] max-h-[70vh] bg-slate-900 border border-slate-700/60 rounded-lg shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
          <Package className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-200 flex-1">Packages Python</span>
          <button onClick={onClose} className="p-1 rounded text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Install input */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-700/30">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleInstall(); }}
            placeholder="numpy pandas matplotlib..."
            className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50"
            disabled={installing}
          />
          <button
            onClick={handleInstall}
            disabled={installing || !input.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-500/20 text-indigo-400 text-xs font-medium hover:bg-indigo-500/30 disabled:opacity-40"
          >
            {installing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Installer
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700/30">
          <button
            onClick={() => setTab('install')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium ${tab === 'install' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Sortie{output && ` (${output.split('\n').length - 1} lignes)`}
          </button>
          <button
            onClick={() => setTab('list')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium ${tab === 'list' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Installes ({packages.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden min-h-0">
          {tab === 'install' ? (
            <div ref={outputRef} className="h-full overflow-auto p-3 max-h-[40vh]">
              {output ? (
                <pre className="text-[11px] leading-relaxed text-slate-400 whitespace-pre-wrap font-mono">{output}</pre>
              ) : (
                <p className="text-xs text-slate-600 text-center py-8">
                  Entrez un ou plusieurs noms de packages et cliquez Installer
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col h-full max-h-[40vh]">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/20">
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrer..."
                  className="flex-1 bg-slate-800/40 border border-slate-700/30 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-600 outline-none"
                />
                <button
                  onClick={loadPackages}
                  disabled={loadingList}
                  className="p-1 rounded text-slate-500 hover:text-slate-300"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                {filteredPackages.map((pkg) => (
                  <div key={pkg.name} className="flex items-center gap-2 px-3 py-1 hover:bg-slate-800/40">
                    <span className="text-xs text-slate-300 flex-1 truncate">{pkg.name}</span>
                    <span className="text-[10px] text-slate-600 font-mono">{pkg.version}</span>
                  </div>
                ))}
                {filteredPackages.length === 0 && (
                  <p className="text-xs text-slate-600 text-center py-6">
                    {filter ? 'Aucun resultat' : 'Chargement...'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
