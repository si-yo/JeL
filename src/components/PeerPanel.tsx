import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { cn } from '../utils/cn';
import {
  Circle, Zap, Share2, Smartphone, Copy, Check, Eye, EyeOff,
  Globe, Lock, Plus, Download, Trash2, KeyRound, ChevronDown, ChevronRight,
  Link, RefreshCw, ExternalLink, User, FileText, FolderOpen,
} from 'lucide-react';
import type { Peer } from '../types';
import { openPeerNotebook, forceSwarmRefresh, getOwnPeerId } from '../services/collabBridge';

function SwarmKeySection() {
  const ipfsAvailable = useStore((s) => s.ipfsAvailable);
  const ipfsRunning = useStore((s) => s.ipfsRunning);
  const swarmKeys = useStore((s) => s.swarmKeys);
  const activeSwarmKey = useStore((s) => s.activeSwarmKey);

  const [expanded, setExpanded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importName, setImportName] = useState('');
  const [importKey, setImportKey] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  if (ipfsAvailable !== true) return null;

  const loadKeys = async () => {
    const keys = await window.labAPI.ipfs.swarmKeyList();
    useStore.getState().setSwarmKeys(keys);
  };

  const handleGenerate = async () => {
    const { key } = await window.labAPI.ipfs.swarmKeyGenerate();
    setPendingKey(key);
    setNaming(true);
    setNewName('');
  };

  const handleSaveGenerated = async () => {
    if (!newName.trim() || !pendingKey) return;
    await window.labAPI.ipfs.swarmKeySave({ name: newName.trim(), key: pendingKey });
    setPendingKey(null);
    setNaming(false);
    setNewName('');
    await loadKeys();
  };

  const handleImport = async () => {
    if (!importName.trim() || !importKey.trim()) return;
    await window.labAPI.ipfs.swarmKeySave({ name: importName.trim(), key: importKey.trim() });
    setImporting(false);
    setImportName('');
    setImportKey('');
    await loadKeys();
  };

  const handleApply = async (name: string) => {
    const result = await window.labAPI.ipfs.swarmKeyApply(name);
    if (result.success) {
      useStore.getState().setActiveSwarmKey(name);
      useStore.getState().setIpfsRunning(false);
      useStore.getState().setPeers([]);
    }
  };

  const handleClear = async () => {
    const result = await window.labAPI.ipfs.swarmKeyClear();
    if (result.success) {
      useStore.getState().setActiveSwarmKey(null);
      useStore.getState().setIpfsRunning(false);
      useStore.getState().setPeers([]);
    }
  };

  const handleDelete = async (name: string) => {
    await window.labAPI.ipfs.swarmKeyDelete(name);
    if (activeSwarmKey === name) {
      await handleClear();
    }
    await loadKeys();
  };

  const handleCopy = (name: string, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(name);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="border-t border-slate-700/30 pt-2">
      <button
        onClick={() => { setExpanded(!expanded); if (!expanded) loadKeys(); }}
        className="flex items-center gap-1.5 w-full mb-1"
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
        <KeyRound className="w-3 h-3 text-amber-400" />
        <span className="text-[10px] font-medium text-slate-300">Reseau</span>
        <span className="ml-auto flex items-center gap-1">
          {activeSwarmKey ? (
            <>
              <Lock className="w-2.5 h-2.5 text-amber-400" />
              <span className="text-[9px] text-amber-400">Prive</span>
            </>
          ) : (
            <>
              <Globe className="w-2.5 h-2.5 text-emerald-400" />
              <span className="text-[9px] text-emerald-400">Public</span>
            </>
          )}
        </span>
      </button>

      {expanded && (
        <div className="space-y-1.5 mt-1">
          {activeSwarmKey && (
            <div className="bg-amber-500/10 rounded px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-amber-300">
                  Cle : {activeSwarmKey}
                </span>
                <button
                  onClick={handleClear}
                  className="text-[9px] text-slate-500 hover:text-red-400"
                >
                  Quitter
                </button>
              </div>
              {!ipfsRunning && (
                <p className="text-[9px] text-slate-500 mt-0.5">
                  Relancez IPFS pour rejoindre le reseau prive.
                </p>
              )}
            </div>
          )}

          {swarmKeys.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider">Cles enregistrees</span>
              {swarmKeys.map((entry) => (
                <div
                  key={entry.name}
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-1 rounded text-[11px]',
                    activeSwarmKey === entry.name
                      ? 'bg-amber-500/10 text-amber-300'
                      : 'text-slate-400 hover:bg-slate-800/50'
                  )}
                >
                  {activeSwarmKey === entry.name ? (
                    <Lock className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                  ) : (
                    <KeyRound className="w-2.5 h-2.5 shrink-0 text-slate-600" />
                  )}
                  <span className="truncate flex-1">{entry.name}</span>
                  <button
                    onClick={() => handleCopy(entry.name, entry.key)}
                    className="text-slate-600 hover:text-slate-300 shrink-0"
                    title="Copier la cle"
                  >
                    {copiedKey === entry.name ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  {activeSwarmKey !== entry.name && (
                    <button
                      onClick={() => handleApply(entry.name)}
                      className="text-[9px] text-amber-500 hover:text-amber-300 shrink-0"
                      title="Utiliser cette cle"
                    >
                      Activer
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(entry.name)}
                    className="text-slate-700 hover:text-red-400 shrink-0"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {naming ? (
            <div className="bg-slate-800/60 rounded px-2 py-1.5 space-y-1">
              <span className="text-[10px] text-slate-400">Nom de la cle :</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveGenerated()}
                placeholder="ex: Mon equipe"
                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <div className="flex gap-1">
                <button
                  onClick={handleSaveGenerated}
                  disabled={!newName.trim()}
                  className="flex-1 py-1 rounded text-[10px] bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
                >
                  Enregistrer
                </button>
                <button
                  onClick={() => { setNaming(false); setPendingKey(null); }}
                  className="px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-300"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : importing ? (
            <div className="bg-slate-800/60 rounded px-2 py-1.5 space-y-1">
              <span className="text-[10px] text-slate-400">Importer une cle :</span>
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="Nom"
                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <textarea
                value={importKey}
                onChange={(e) => setImportKey(e.target.value)}
                placeholder="Collez la cle ici..."
                rows={3}
                className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
              />
              <div className="flex gap-1">
                <button
                  onClick={handleImport}
                  disabled={!importName.trim() || !importKey.trim()}
                  className="flex-1 py-1 rounded text-[10px] bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 disabled:opacity-40"
                >
                  Importer
                </button>
                <button
                  onClick={() => { setImporting(false); setImportName(''); setImportKey(''); }}
                  className="px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-300"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1">
              <button
                onClick={handleGenerate}
                className="flex items-center gap-1 flex-1 px-2 py-1 rounded text-[10px] text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Generer
              </button>
              <button
                onClick={() => setImporting(true)}
                className="flex items-center gap-1 flex-1 px-2 py-1 rounded text-[10px] text-slate-400 bg-slate-800/50 hover:bg-slate-800 transition-colors"
              >
                <Download className="w-3 h-3" />
                Importer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BridgeSection() {
  const bridgeRunning = useStore((s) => s.bridgeRunning);
  const bridgePin = useStore((s) => s.bridgePin);
  const bridgeIp = useStore((s) => s.bridgeIp);
  const bridgeClients = useStore((s) => s.bridgeClients);

  const [copied, setCopied] = useState(false);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    const cleanup = window.labAPI.bridge.onClientCount((count) => {
      useStore.getState().setBridgeClients(count);
    });
    return cleanup;
  }, []);

  const startBridge = useCallback(async () => {
    const result = await window.labAPI.bridge.start();
    if (result.success) {
      useStore.getState().setBridgeRunning(true, result.pin, result.ip);
    }
  }, []);

  const stopBridge = useCallback(async () => {
    await window.labAPI.bridge.stop();
    useStore.getState().setBridgeRunning(false);
    useStore.getState().setBridgeClients(0);
  }, []);

  const copyBridgeUrl = useCallback(() => {
    if (!bridgeIp || !bridgePin) return;
    const url = `http://${bridgeIp}:9100?token=${bridgePin}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [bridgeIp, bridgePin]);

  const bridgeUrl = bridgeIp ? `http://${bridgeIp}:9100` : '';

  return (
    <div className="border-t border-slate-700/30 pt-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Smartphone className="w-3 h-3 text-cyan-400" />
        <span className="text-[10px] font-medium text-slate-300">Acces mobile</span>
      </div>

      {!bridgeRunning ? (
        <button
          onClick={startBridge}
          className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded text-xs text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors"
        >
          <Smartphone className="w-3.5 h-3.5" />
          Activer acces mobile
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-emerald-500">Bridge actif</span>
            <button
              onClick={stopBridge}
              className="text-[10px] text-slate-600 hover:text-red-400"
            >
              Desactiver
            </button>
          </div>

          <div className="bg-slate-800/60 rounded px-2 py-1.5">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] text-slate-500">URL</span>
              <button
                onClick={copyBridgeUrl}
                className="ml-auto text-slate-500 hover:text-slate-300"
                title="Copier l'URL"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <code className="text-[10px] text-cyan-300 break-all">{bridgeUrl}</code>
          </div>

          <div className="bg-slate-800/60 rounded px-2 py-1.5">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500">PIN</span>
              <button
                onClick={() => setShowPin(!showPin)}
                className="ml-auto text-slate-500 hover:text-slate-300"
              >
                {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
            <code className="text-sm font-bold text-amber-300 tracking-widest">
              {showPin ? bridgePin : '******'}
            </code>
          </div>

          <div className="text-[10px] text-slate-500">
            {bridgeClients} client(s) mobile
          </div>
        </div>
      )}
    </div>
  );
}

function PeerCard({ peer }: { peer: Peer }) {
  const peerManifests = useStore((s) => s.peerManifests);
  const remoteCursors = useStore((s) => s.remoteCursors);
  const toggleCursorVisibility = useStore((s) => s.toggleCursorVisibility);
  const [expanded, setExpanded] = useState(false);
  const manifest = peerManifests[peer.id];
  const peerName = manifest?.peerName || peer.name || peer.id.slice(0, 12) + '...';
  const nbCount = manifest?.notebooks.length || 0;
  const cursor = remoteCursors[peer.id];
  const cursorVisible = cursor?.visible ?? true;

  return (
    <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 overflow-hidden">
      {/* Peer header — clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-2 text-left hover:bg-slate-800/60 transition-colors"
      >
        <Circle
          className={cn(
            'w-2 h-2 fill-current shrink-0',
            peer.status === 'online' ? 'text-emerald-400' : 'text-slate-600'
          )}
        />
        <User className="w-3 h-3 text-slate-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-[11px] text-slate-200 font-medium truncate block">
            {peerName}
          </span>
          {peer.activeNotebook && (
            <span className="text-[9px] text-slate-500 truncate block">
              {peer.activeNotebook.split('/').pop()}
            </span>
          )}
        </div>
        {cursor && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleCursorVisibility(peer.id); }}
            className={cn(
              'p-0.5 rounded shrink-0 transition-colors',
              cursorVisible ? 'text-cyan-400 hover:text-cyan-300' : 'text-slate-600 hover:text-slate-400'
            )}
            title={cursorVisible ? 'Masquer le curseur' : 'Afficher le curseur'}
          >
            {cursorVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </button>
        )}
        {nbCount > 0 && (
          <span className="text-[9px] text-violet-400 bg-violet-500/15 px-1.5 py-0.5 rounded-full shrink-0">
            {nbCount} doc{nbCount > 1 ? 's' : ''}
          </span>
        )}
        {nbCount > 0 ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
          )
        ) : null}
      </button>

      {/* Expanded: shared notebooks list */}
      {expanded && manifest && manifest.notebooks.length > 0 && (
        <div className="border-t border-slate-700/30 px-2 py-1.5 space-y-1">
          {manifest.notebooks.map((nb) => (
            <button
              key={nb.path}
              onClick={() => openPeerNotebook(peer.id, nb.path).catch(console.error)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left bg-slate-900/40 hover:bg-indigo-500/10 hover:border-indigo-500/30 border border-transparent transition-colors group"
            >
              <FileText className="w-3 h-3 text-violet-400/70 shrink-0 group-hover:text-violet-400" />
              <div className="flex-1 min-w-0">
                <span className="text-[11px] text-slate-300 group-hover:text-slate-100 truncate block">
                  {nb.name}
                </span>
                {nb.exports.length > 0 && (
                  <span className="text-[9px] text-slate-600 group-hover:text-slate-500">
                    {nb.exports.slice(0, 3).join(', ')}{nb.exports.length > 3 ? ` +${nb.exports.length - 3}` : ''}
                  </span>
                )}
              </div>
              <ExternalLink className="w-3 h-3 text-slate-600 group-hover:text-cyan-400 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Expanded but no shared docs */}
      {expanded && (!manifest || manifest.notebooks.length === 0) && (
        <div className="border-t border-slate-700/30 px-3 py-2">
          <p className="text-[10px] text-slate-600 italic">Aucun document partage</p>
        </div>
      )}
    </div>
  );
}

export function PeerPanel() {
  const ipfsAvailable = useStore((s) => s.ipfsAvailable);
  const ipfsRunning = useStore((s) => s.ipfsRunning);
  const peers = useStore((s) => s.peers);
  const setIpfsRunning = useStore((s) => s.setIpfsRunning);
  const notebooks = useStore((s) => s.notebooks);
  const sharedNotebooks = useStore((s) => s.sharedNotebooks);
  const activeSwarmKey = useStore((s) => s.activeSwarmKey);
  const collabPseudo = useStore((s) => s.collabPseudo);
  const setCollabPseudo = useStore((s) => s.setCollabPseudo);
  const savedPeerAddrs = useStore((s) => s.savedPeerAddrs);

  const [nodeId, setNodeId] = useState<string | null>(null);
  const [nodeAddrs, setNodeAddrs] = useState<string[]>([]);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [connectAddr, setConnectAddr] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [editingPseudo, setEditingPseudo] = useState(false);
  const [pseudoDraft, setPseudoDraft] = useState(collabPseudo);
  const [copiedPeerId, setCopiedPeerId] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for swarm key changes from main process
  useEffect(() => {
    const cleanup = window.labAPI.ipfs.onSwarmChanged((data) => {
      useStore.getState().setActiveSwarmKey(data.active ? (data.name || null) : null);
      useStore.getState().setIpfsRunning(false);
      useStore.getState().setPeers([]);
    });
    return cleanup;
  }, []);

  // Countdown visual timer — swarm polling is now handled by collabBridge background service
  useEffect(() => {
    if (!ipfsRunning) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setCountdown(5);
      return;
    }

    // 1s countdown ticker (visual only — matches the 5s poll in collabBridge)
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 5 : c - 1));
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [ipfsRunning]);

  // Fetch node info when IPFS starts
  useEffect(() => {
    if (!ipfsRunning) {
      setNodeId(null);
      setNodeAddrs([]);
      return;
    }
    window.labAPI.ipfs.getNodeInfo().then((info) => {
      if (info.success) {
        setNodeId(info.peerId || null);
        setNodeAddrs(info.addrs || []);
      }
    });
  }, [ipfsRunning]);

  const startIpfs = useCallback(async () => {
    const result = await window.labAPI.ipfs.daemonStart();
    if (result.success) {
      setIpfsRunning(true);
    }
  }, [setIpfsRunning]);

  const stopIpfs = useCallback(async () => {
    await window.labAPI.ipfs.daemonStop();
    setIpfsRunning(false);
    useStore.getState().setPeers([]);
  }, [setIpfsRunning]);

  const toggleShare = useCallback((path: string) => {
    useStore.getState().toggleShareNotebook(path);
    // Manifest will be re-published reactively via broadcastPresence subscriber in App.tsx
  }, []);

  const copyNodeAddr = useCallback(() => {
    const addr = nodeAddrs.find((a) => !a.includes('/127.0.0.1/') && !a.includes('/::1/'));
    if (addr && nodeId) {
      const full = addr.includes('/p2p/') ? addr : `${addr}/p2p/${nodeId}`;
      navigator.clipboard.writeText(full);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 2000);
    }
  }, [nodeAddrs, nodeId]);

  const handleConnect = useCallback(async () => {
    if (!connectAddr.trim()) return;
    setConnecting(true);
    setConnectError(null);
    const addr = connectAddr.trim();
    const result = await window.labAPI.ipfs.swarmConnect({ multiaddr: addr });
    setConnecting(false);
    if (result.success) {
      // Save multiaddr for auto-reconnect (LAN/WAN)
      useStore.getState().addSavedPeerAddr(addr);
      setConnectAddr('');
      setShowConnect(false);
    } else {
      setConnectError(result.error || 'Echec de connexion');
    }
  }, [connectAddr]);

  const savePseudo = useCallback(() => {
    const trimmed = pseudoDraft.trim();
    setCollabPseudo(trimmed);
    setEditingPseudo(false);
    // Manifest will be re-published reactively via broadcastPresence subscriber in App.tsx
  }, [pseudoDraft, setCollabPseudo]);

  const handleRefreshPeers = useCallback(async () => {
    if (!ipfsRunning || refreshing) return;
    setRefreshing(true);
    try {
      await forceSwarmRefresh();
      setCountdown(5);
    } finally {
      setTimeout(() => setRefreshing(false), 600);
    }
  }, [ipfsRunning, refreshing]);

  return (
    <div className="px-2 py-1 space-y-3">

      {/* Pseudo / Identity section */}
      <div className="bg-slate-800/40 rounded-lg px-2.5 py-2">
        <div className="flex items-center gap-1.5 mb-1">
          <User className="w-3 h-3 text-indigo-400" />
          <span className="text-[10px] font-medium text-slate-300">Mon identite</span>
        </div>
        {!editingPseudo ? (
          <button
            onClick={() => { setPseudoDraft(collabPseudo); setEditingPseudo(true); }}
            className="flex items-center gap-1.5 w-full text-left group"
          >
            <span className={cn(
              'text-xs truncate flex-1',
              collabPseudo ? 'text-slate-200' : 'text-slate-600 italic'
            )}>
              {collabPseudo || 'Definir un pseudo...'}
            </span>
            <span className="text-[9px] text-slate-600 group-hover:text-slate-400">modifier</span>
          </button>
        ) : (
          <div className="space-y-1">
            <input
              type="text"
              value={pseudoDraft}
              onChange={(e) => setPseudoDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') savePseudo(); if (e.key === 'Escape') setEditingPseudo(false); }}
              placeholder="Votre pseudo (visible par les pairs)"
              className="w-full px-2 py-1 rounded bg-slate-900 border border-indigo-500/50 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            <div className="flex gap-1">
              <button
                onClick={savePseudo}
                className="flex-1 py-1 rounded text-[10px] bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
              >
                Valider
              </button>
              <button
                onClick={() => setEditingPseudo(false)}
                className="px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-300"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
        {/* Multiaddr — copyable */}
        {(() => {
          if (!nodeId || nodeAddrs.length === 0) return null;
          const extAddr = nodeAddrs.find((a) => !a.includes('/127.0.0.1/') && !a.includes('/::1/'));
          if (!extAddr) return null;
          const fullAddr = extAddr.includes('/p2p/') ? extAddr : `${extAddr}/p2p/${nodeId}`;
          return (
            <button
              onClick={() => {
                navigator.clipboard.writeText(fullAddr);
                setCopiedPeerId(true);
                setTimeout(() => setCopiedPeerId(false), 2000);
              }}
              className="flex items-center gap-1 mt-1.5 w-full text-left group"
              title={fullAddr}
            >
              <span className="text-[9px] text-slate-600">Addr</span>
              <code className="text-[9px] text-indigo-400/70 truncate flex-1 font-mono">
                {fullAddr}
              </code>
              {copiedPeerId ? (
                <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-2.5 h-2.5 text-slate-600 group-hover:text-slate-400 shrink-0" />
              )}
            </button>
          );
        })()}
      </div>

      {/* IPFS Section */}
      <div>
        {ipfsAvailable === false ? (
          <>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-500 bg-slate-800/50">
              <Zap className="w-3.5 h-3.5 text-slate-600" />
              IPFS non installe
            </div>
            <p className="text-[10px] text-slate-600 mt-1 px-0.5">
              Installez Kubo pour la collaboration P2P entre desktops.
            </p>
          </>
        ) : !ipfsRunning ? (
          <>
            <button
              onClick={startIpfs}
              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Demarrer IPFS
            </button>
            <p className="text-[10px] text-slate-600 mt-1 px-0.5">
              {activeSwarmKey ? `Reseau prive : ${activeSwarmKey}` : 'Necessaire pour la collaboration P2P'}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[10px] text-emerald-500">IPFS actif</span>
              {activeSwarmKey && (
                <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1 rounded">
                  {activeSwarmKey}
                </span>
              )}
              <button
                onClick={stopIpfs}
                className="ml-auto text-[10px] text-slate-600 hover:text-red-400"
              >
                Arreter
              </button>
            </div>

            {/* Manual connect */}
            <div className="mb-2">
              {!showConnect ? (
                <button
                  onClick={() => setShowConnect(true)}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
                >
                  <Link className="w-3 h-3" />
                  Connecter un peer
                </button>
              ) : (
                <div className="bg-slate-800/60 rounded px-2 py-1.5 space-y-1">
                  <span className="text-[9px] text-slate-500">Collez l'adresse du peer :</span>
                  <input
                    type="text"
                    value={connectAddr}
                    onChange={(e) => setConnectAddr(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                    placeholder="/ip4/192.168.../tcp/4001/p2p/12D3..."
                    className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                  {connectError && (
                    <p className="text-[9px] text-red-400">{connectError}</p>
                  )}
                  <div className="flex gap-1">
                    <button
                      onClick={handleConnect}
                      disabled={!connectAddr.trim() || connecting}
                      className="flex items-center gap-1 flex-1 py-1 rounded text-[10px] bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40"
                    >
                      {connecting && <RefreshCw className="w-3 h-3 animate-spin" />}
                      Connecter
                    </button>
                    <button
                      onClick={() => { setShowConnect(false); setConnectAddr(''); setConnectError(null); }}
                      className="px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-300"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Peers ── collapsible cards */}
            <div className="border-t border-slate-700/30 pt-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Globe className="w-3 h-3 text-indigo-400" />
                <span className="text-[10px] font-medium text-slate-300">Pairs connectes</span>
                <span className="ml-auto text-[9px] text-slate-600">{peers.length}</span>
                <button
                  onClick={handleRefreshPeers}
                  disabled={refreshing}
                  className="relative p-0.5 rounded text-slate-600 hover:text-indigo-400 transition-colors disabled:opacity-40"
                  title="Rafraichir"
                >
                  {/* Countdown ring */}
                  {ipfsRunning && !refreshing && (
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 20 20">
                      <circle
                        cx="10" cy="10" r="8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeDasharray={`${(countdown / 5) * 50.27} 50.27`}
                        className="text-indigo-500/30 transition-[stroke-dasharray] duration-1000 ease-linear"
                      />
                    </svg>
                  )}
                  <RefreshCw className={cn('w-3 h-3 relative', refreshing && 'animate-spin')} />
                </button>
              </div>

              {peers.length === 0 ? (
                <p className="text-[10px] text-slate-600 py-1 italic">Aucun pair connecte</p>
              ) : (
                <div className="space-y-1">
                  {peers.map((peer) => (
                    <PeerCard key={peer.id} peer={peer} />
                  ))}
                </div>
              )}
            </div>

            {/* ── My shared notebooks */}
            <div className="border-t border-slate-700/30 pt-2 mt-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Share2 className="w-3 h-3 text-violet-400" />
                <span className="text-[10px] font-medium text-slate-300">Mes partages</span>
              </div>

              {notebooks.length > 0 ? (
                <div className="space-y-0.5">
                  {notebooks.map((nb) => {
                    const p = nb.filePath || nb.fileName;
                    const isShared = sharedNotebooks.includes(p);
                    return (
                      <button
                        key={nb.id}
                        onClick={() => toggleShare(p)}
                        className={cn(
                          'flex items-center gap-1.5 w-full px-2 py-1.5 rounded-md text-[11px] transition-colors text-left',
                          isShared
                            ? 'text-violet-300 bg-violet-500/15 border border-violet-500/20'
                            : 'text-slate-500 hover:text-slate-400 hover:bg-slate-800/50 border border-transparent'
                        )}
                      >
                        <Share2 className={cn('w-3 h-3 shrink-0', isShared ? 'text-violet-400' : 'text-slate-600')} />
                        <span className="truncate flex-1">{nb.fileName}</span>
                        {isShared && (
                          <span className="text-[9px] text-violet-400/70 shrink-0">partage</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-slate-600 italic">
                  Ouvrez un notebook pour le partager
                </p>
              )}
            </div>

            {/* ── Saved peer addrs (auto-reconnect) */}
            {savedPeerAddrs.length > 0 && (
              <div className="border-t border-slate-700/30 pt-2 mt-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <Link className="w-3 h-3 text-cyan-400" />
                  <span className="text-[10px] font-medium text-slate-300">Peers sauvegardes</span>
                  <span className="ml-auto text-[9px] text-slate-600">{savedPeerAddrs.length}</span>
                </div>
                <div className="space-y-0.5">
                  {savedPeerAddrs.map((addr) => {
                    const peerId = addr.match(/\/p2p\/(\w+)$/)?.[1];
                    return (
                      <div key={addr} className="flex items-center gap-1 px-1.5 py-1 rounded bg-slate-800/30 group">
                        <code className="text-[9px] text-cyan-400/60 font-mono truncate flex-1" title={addr}>
                          {peerId ? `...${peerId.slice(-8)}` : addr.slice(0, 30)}
                        </code>
                        <button
                          onClick={() => useStore.getState().removeSavedPeerAddr(addr)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-600 hover:text-red-400 transition-opacity"
                          title="Supprimer"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[9px] text-slate-600 mt-1">
                  Reconnexion auto au demarrage et refresh
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Swarm Key Management */}
      <SwarmKeySection />

      {/* Mobile Bridge */}
      <BridgeSection />
    </div>
  );
}
