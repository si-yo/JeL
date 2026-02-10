import { useState } from 'react';
import { X, Download, Loader2, RefreshCw } from 'lucide-react';
import { bridge } from '../services/wsBridge';

interface Props {
  pipResult: { success: boolean; output?: string; error?: string } | null;
  pipPackages: Array<{ name: string; version: string }>;
  onClose: () => void;
}

export function MobilePackages({ pipResult, pipPackages, onClose }: Props) {
  const [input, setInput] = useState('');
  const [installing, setInstalling] = useState(false);
  const [tab, setTab] = useState<'install' | 'list'>('install');
  const [filter, setFilter] = useState('');

  const handleInstall = () => {
    if (!input.trim() || installing) return;
    setInstalling(true);
    bridge.pipInstall(input.trim());
    // Will be reset when pip-result event arrives
    setTimeout(() => setInstalling(false), 30000); // Safety timeout
  };

  const handleRefreshList = () => {
    bridge.pipList();
  };

  // Reset installing when result arrives
  if (pipResult && installing) {
    setInstalling(false);
  }

  const filteredPackages = filter
    ? pipPackages.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
    : pipPackages;

  return (
    <div className="bg-slate-900/95 border-b border-slate-700/50 max-h-[60vh] flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/30">
        <span className="text-xs font-medium text-slate-300 flex-1">Packages Python</span>
        <button onClick={onClose} className="p-1 rounded text-slate-500 hover:text-slate-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Install input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/20">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleInstall(); }}
          placeholder="numpy pandas..."
          className="flex-1 bg-slate-800/60 border border-slate-700/40 rounded px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-indigo-500/50"
          disabled={installing}
        />
        <button
          onClick={handleInstall}
          disabled={installing || !input.trim()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-indigo-500/20 text-indigo-400 text-[11px] font-medium disabled:opacity-40"
        >
          {installing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
          pip install
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/30">
        <button
          onClick={() => setTab('install')}
          className={`flex-1 px-3 py-1.5 text-[11px] font-medium ${tab === 'install' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500'}`}
        >
          Sortie
        </button>
        <button
          onClick={() => { setTab('list'); handleRefreshList(); }}
          className={`flex-1 px-3 py-1.5 text-[11px] font-medium ${tab === 'list' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-slate-500'}`}
        >
          Installes ({pipPackages.length})
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto max-h-[35vh]">
        {tab === 'install' ? (
          <div className="p-3">
            {pipResult ? (
              <pre className="text-[10px] leading-relaxed text-slate-400 whitespace-pre-wrap font-mono">
                {pipResult.output || pipResult.error || (pipResult.success ? 'OK' : 'Erreur')}
              </pre>
            ) : (
              <p className="text-[11px] text-slate-600 text-center py-6">
                Entrez un nom de package et appuyez sur pip install
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-700/20">
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrer..."
                className="flex-1 bg-slate-800/40 border border-slate-700/30 rounded px-2 py-1 text-[11px] text-slate-300 placeholder-slate-600 outline-none"
              />
              <button onClick={handleRefreshList} className="p-1 rounded text-slate-500 hover:text-slate-300">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            {filteredPackages.map((pkg) => (
              <div key={pkg.name} className="flex items-center gap-2 px-3 py-1 hover:bg-slate-800/40">
                <span className="text-[11px] text-slate-300 flex-1 truncate">{pkg.name}</span>
                <span className="text-[9px] text-slate-600 font-mono">{pkg.version}</span>
              </div>
            ))}
            {filteredPackages.length === 0 && (
              <p className="text-[11px] text-slate-600 text-center py-4">
                {filter ? 'Aucun resultat' : 'Aucun package'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
