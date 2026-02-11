import { useState } from 'react';
import { useStore } from '../store/useStore';
import {
  Server, Play, Square, RefreshCw, Globe, ChevronDown, ChevronRight,
  Zap, Activity, ExternalLink,
} from 'lucide-react';
import type { SoaServiceInfo } from '../types';

// ── Service Card ──────────────────────────────────────

function ServiceCard({ service, isLocal, onStop }: {
  service: SoaServiceInfo;
  isLocal: boolean;
  onStop?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-800/30 border border-slate-700/40 rounded-lg p-2.5">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          service.status === 'running' ? 'bg-emerald-400' :
          service.status === 'error' ? 'bg-red-400' : 'bg-slate-500'
        }`} />
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          {expanded ? <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />}
          <span className="text-xs font-medium text-slate-200 truncate">{service.name}</span>
          <span className="text-[9px] text-slate-500 shrink-0">v{service.version}</span>
        </button>
        <span className="text-[9px] text-slate-500 shrink-0">
          {service.endpoints.length} ep
        </span>
        {isLocal && onStop && service.status === 'running' && (
          <button
            onClick={onStop}
            className="p-1 rounded hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors"
            title="Arreter le service"
          >
            <Square className="w-3 h-3" />
          </button>
        )}
      </div>

      {!isLocal && (
        <div className="flex items-center gap-1 mt-1 ml-5">
          <Globe className="w-2.5 h-2.5 text-slate-500" />
          <span className="text-[9px] text-slate-500 truncate">{service.peerName || service.peerId.slice(0, 12)}</span>
        </div>
      )}

      {expanded && (
        <div className="mt-2 ml-5 space-y-1">
          {service.endpoints.map((ep) => (
            <div key={`${ep.method}-${ep.path}`} className="flex items-center gap-1.5">
              <span className={`text-[9px] font-mono font-bold px-1 py-0.5 rounded ${
                ep.method === 'GET' ? 'bg-emerald-500/10 text-emerald-400' :
                ep.method === 'POST' ? 'bg-blue-500/10 text-blue-400' :
                ep.method === 'PUT' ? 'bg-amber-500/10 text-amber-400' :
                'bg-red-500/10 text-red-400'
              }`}>
                {ep.method}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{ep.path}</span>
              <span className="text-[9px] text-slate-600 ml-auto">{ep.name}()</span>
            </div>
          ))}
          {isLocal && (
            <div className="text-[9px] text-slate-600 mt-1 truncate">
              {service.notebookPath.split('/').pop()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SOA Panel ─────────────────────────────────────────

export function SoaPanel() {
  const soaEnabled = useStore((s) => s.soaEnabled);
  const runningServices = useStore((s) => s.soaRunningServices);
  const availableServices = useStore((s) => s.soaAvailableServices);
  const ipfsRunning = useStore((s) => s.ipfsRunning);
  const activeSwarmKey = useStore((s) => s.activeSwarmKey);

  const [loading, setLoading] = useState<string | null>(null);

  const handleStopService = async (serviceName: string) => {
    setLoading(serviceName);
    try {
      const { getSoaService } = await import('../services/soaService');
      const soa = getSoaService();
      if (soa) await soa.stopService(serviceName);
    } catch (err) {
      console.error('[SoaPanel] Stop error:', err);
    }
    setLoading(null);
  };

  const handleStartFromFile = async () => {
    const result = await window.labAPI.dialog.openFile({
      filters: [{ name: 'Jupyter Notebook', extensions: ['ipynb'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return;

    setLoading('__starting__');
    try {
      const { getSoaService } = await import('../services/soaService');
      const soa = getSoaService();
      if (soa) await soa.startService(result.filePaths[0]);
    } catch (err) {
      console.error('[SoaPanel] Start error:', err);
    }
    setLoading(null);
  };

  const handleRefresh = async () => {
    setLoading('__refresh__');
    try {
      const { destroySoa, initSoa } = await import('../services/soaService');
      await destroySoa();
      await initSoa();
    } catch (err) {
      console.error('[SoaPanel] Refresh error:', err);
    }
    setLoading(null);
  };

  if (!ipfsRunning) {
    return (
      <div className="p-3 text-center">
        <Activity className="w-5 h-5 text-slate-600 mx-auto mb-2" />
        <p className="text-[10px] text-slate-500">IPFS doit etre actif pour le SOA</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-medium text-slate-200">SOA Services</span>
          {soaEnabled && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={!!loading}
            className="p-1 rounded hover:bg-slate-700/50 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
            title="Rafraichir"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading === '__refresh__' ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Network info */}
      {activeSwarmKey && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/10">
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-[9px] text-amber-300 truncate">Reseau prive: {activeSwarmKey}</span>
        </div>
      )}

      {/* My Services */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Mes services</span>
          <button
            onClick={handleStartFromFile}
            disabled={!!loading}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
          >
            <Play className="w-2.5 h-2.5" />
            Demarrer
          </button>
        </div>
        {runningServices.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic ml-1">Aucun service local</p>
        ) : (
          <div className="space-y-1.5">
            {runningServices.map((svc) => (
              <ServiceCard
                key={svc.name}
                service={svc}
                isLocal
                onStop={() => handleStopService(svc.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Remote Services */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Services distants</span>
          <ExternalLink className="w-2.5 h-2.5 text-slate-600" />
        </div>
        {availableServices.length === 0 ? (
          <p className="text-[10px] text-slate-600 italic ml-1">Aucun service distant detecte</p>
        ) : (
          <div className="space-y-1.5">
            {availableServices.map((svc) => (
              <ServiceCard
                key={`${svc.name}-${svc.peerId}`}
                service={svc}
                isLocal={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Usage hint */}
      <div className="text-[9px] text-slate-600 leading-relaxed border-t border-slate-700/30 pt-2">
        <p className="mb-1">Commandes magiques:</p>
        <code className="text-violet-400/70">%soa service.ipynb</code> — demarrer<br />
        <code className="text-violet-400/70">%soa.call svc /path {'{}'}</code> — appeler<br />
        <code className="text-violet-400/70">%soa.stop svc</code> — arreter<br />
        <code className="text-violet-400/70">%soa.list</code> — lister
      </div>
    </div>
  );
}
