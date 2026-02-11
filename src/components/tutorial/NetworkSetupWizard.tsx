import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useTutorialStore, type NetworkStep } from '../../store/useTutorialStore';
import { TutorialStepCard } from './TutorialStepCard';
import {
  HardDrive, User, KeyRound, Lock, Play, Loader2,
  Plus, Download, AlertTriangle, CheckCircle2, Globe,
} from 'lucide-react';

function stepStatus(
  step: NetworkStep,
  currentStep: NetworkStep,
  completed: NetworkStep[],
  skipped: NetworkStep[],
): 'pending' | 'active' | 'completed' | 'skipped' {
  if (completed.includes(step)) return 'completed';
  if (skipped.includes(step)) return 'skipped';
  if (step === currentStep) return 'active';
  return 'pending';
}

export function NetworkSetupWizard() {
  const networkStep = useTutorialStore((s) => s.networkStep);
  const completedSteps = useTutorialStore((s) => s.completedNetworkSteps);
  const skippedSteps = useTutorialStore((s) => s.skippedSteps);
  const setNetworkStep = useTutorialStore((s) => s.setNetworkStep);

  // Auto-validate steps based on app state
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      const tutorial = useTutorialStore.getState();

      if (state.ipfsAvailable && tutorial.ipfsRepoExists) {
        tutorial.markStepCompleted('check-ipfs');
      }
      if (state.collabPseudo.trim().length > 0) {
        tutorial.markStepCompleted('set-pseudo');
      }
      if (state.swarmKeys.length > 0) {
        tutorial.markStepCompleted('swarm-key');
      }
      if (state.activeSwarmKey !== null) {
        tutorial.markStepCompleted('activate-key');
      }
      if (state.ipfsRunning) {
        tutorial.markStepCompleted('start-daemon');
      }
    });
    return unsub;
  }, []);

  // Auto-advance when current step completes
  useEffect(() => {
    if (completedSteps.includes(networkStep) || skippedSteps.includes(networkStep)) {
      useTutorialStore.getState().advanceToNextStep();
    }
  }, [completedSteps, skippedSteps, networkStep]);

  // Check repo on mount
  useEffect(() => {
    window.labAPI.ipfs.repoExists().then(({ exists }) => {
      useTutorialStore.getState().setIpfsRepoExists(exists);
      if (exists && useStore.getState().ipfsAvailable) {
        useTutorialStore.getState().markStepCompleted('check-ipfs');
      }
    });
  }, []);

  const allDone =
    completedSteps.length + skippedSteps.length >= 5;

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${((completedSteps.length + skippedSteps.length) / 5) * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-slate-500 tabular-nums">
          {completedSteps.length + skippedSteps.length}/5
        </span>
      </div>

      <Step1CheckIpfs
        status={stepStatus('check-ipfs', networkStep, completedSteps, skippedSteps)}
        onSelect={() => setNetworkStep('check-ipfs')}
      />
      <Step2SetPseudo
        status={stepStatus('set-pseudo', networkStep, completedSteps, skippedSteps)}
        onSelect={() => setNetworkStep('set-pseudo')}
      />
      <Step3SwarmKey
        status={stepStatus('swarm-key', networkStep, completedSteps, skippedSteps)}
        onSelect={() => setNetworkStep('swarm-key')}
      />
      <Step4ActivateKey
        status={stepStatus('activate-key', networkStep, completedSteps, skippedSteps)}
        onSelect={() => setNetworkStep('activate-key')}
      />
      <Step5StartDaemon
        status={stepStatus('start-daemon', networkStep, completedSteps, skippedSteps)}
        onSelect={() => setNetworkStep('start-daemon')}
      />

      {allDone && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs text-emerald-300">
            Configuration terminee ! Vous etes pret a collaborer en P2P.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Check IPFS ─────────────────────────────────────────

function Step1CheckIpfs({ status, onSelect }: { status: 'pending' | 'active' | 'completed' | 'skipped'; onSelect: () => void }) {
  const ipfsAvailable = useStore((s) => s.ipfsAvailable);
  const ipfsRepoExists = useTutorialStore((s) => s.ipfsRepoExists);
  const ipfsInitializing = useTutorialStore((s) => s.ipfsInitializing);
  const ipfsInitError = useTutorialStore((s) => s.ipfsInitError);

  const handleInit = async () => {
    useTutorialStore.getState().setIpfsInitializing(true);
    useTutorialStore.getState().setIpfsInitError(null);
    try {
      const result = await window.labAPI.ipfs.init();
      if (result.success) {
        useTutorialStore.getState().setIpfsRepoExists(true);
        // Re-check availability
        const { available } = await window.labAPI.ipfs.available();
        useStore.getState().setIpfsAvailable(available);
      } else {
        useTutorialStore.getState().setIpfsInitError(result.error || 'Erreur inconnue');
      }
    } catch (err) {
      useTutorialStore.getState().setIpfsInitError(String(err));
    }
    useTutorialStore.getState().setIpfsInitializing(false);
  };

  return (
    <TutorialStepCard
      stepNumber={1}
      title="Verifier IPFS"
      description="IPFS (Kubo) est le systeme de fichiers distribue utilise pour la collaboration pair-a-pair."
      status={status}
      icon={<HardDrive className="w-3.5 h-3.5 text-indigo-400" />}
      onSelect={onSelect}
    >
      {ipfsAvailable === false && (
        <div className="rounded bg-amber-500/10 border border-amber-500/20 p-2 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-amber-300 space-y-1">
            <p>IPFS (Kubo) n'est pas installe sur cette machine.</p>
            <p className="text-amber-400/70">
              Installez-le depuis{' '}
              <span className="underline">https://docs.ipfs.tech/install/</span>{' '}
              puis relancez l'application.
            </p>
          </div>
        </div>
      )}

      {ipfsAvailable && ipfsRepoExists === false && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500">
            IPFS est installe mais le depot n'est pas initialise.
          </p>
          <button
            onClick={handleInit}
            disabled={ipfsInitializing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 transition-colors disabled:opacity-50"
          >
            {ipfsInitializing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Initialiser IPFS
          </button>
          {ipfsInitError && (
            <p className="text-[10px] text-red-400">{ipfsInitError}</p>
          )}
        </div>
      )}

      {ipfsAvailable && ipfsRepoExists && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          IPFS est installe et initialise.
        </div>
      )}

      {ipfsAvailable === null && (
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Verification en cours...
        </div>
      )}
    </TutorialStepCard>
  );
}

// ─── Step 2: Set Pseudo ─────────────────────────────────────────

function Step2SetPseudo({ status, onSelect }: { status: 'pending' | 'active' | 'completed' | 'skipped'; onSelect: () => void }) {
  const collabPseudo = useStore((s) => s.collabPseudo);
  const setCollabPseudo = useStore((s) => s.setCollabPseudo);
  const [draft, setDraft] = useState(collabPseudo);

  const save = () => {
    if (draft.trim()) {
      setCollabPseudo(draft.trim());
    }
  };

  return (
    <TutorialStepCard
      stepNumber={2}
      title="Definir un pseudo"
      description="Ce nom sera visible par les pairs connectes a votre reseau."
      status={status}
      icon={<User className="w-3.5 h-3.5 text-cyan-400" />}
      onSelect={onSelect}
    >
      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="Votre pseudo..."
          className="flex-1 bg-slate-950/50 border border-slate-700/50 rounded px-2 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
        />
        <button
          onClick={save}
          disabled={!draft.trim()}
          className="px-2.5 py-1 rounded text-[11px] font-medium bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 transition-colors disabled:opacity-50"
        >
          OK
        </button>
      </div>
      {collabPseudo && (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          Pseudo actuel : {collabPseudo}
        </div>
      )}
    </TutorialStepCard>
  );
}

// ─── Step 3: Swarm Key ──────────────────────────────────────────

function Step3SwarmKey({ status, onSelect }: { status: 'pending' | 'active' | 'completed' | 'skipped'; onSelect: () => void }) {
  const swarmKeys = useStore((s) => s.swarmKeys);
  const [mode, setMode] = useState<'choose' | 'generate' | 'import'>('choose');
  const [name, setName] = useState('');
  const [importKey, setImportKey] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    const { key } = await window.labAPI.ipfs.swarmKeyGenerate();
    setPendingKey(key);
    setMode('generate');
    setLoading(false);
  };

  const handleSaveGenerated = async () => {
    if (!name.trim() || !pendingKey) return;
    setLoading(true);
    await window.labAPI.ipfs.swarmKeySave({ name: name.trim(), key: pendingKey });
    const keys = await window.labAPI.ipfs.swarmKeyList();
    useStore.getState().setSwarmKeys(keys);
    setPendingKey(null);
    setMode('choose');
    setName('');
    setLoading(false);
  };

  const handleImport = async () => {
    if (!name.trim() || !importKey.trim()) return;
    setLoading(true);
    await window.labAPI.ipfs.swarmKeySave({ name: name.trim(), key: importKey.trim() });
    const keys = await window.labAPI.ipfs.swarmKeyList();
    useStore.getState().setSwarmKeys(keys);
    setMode('choose');
    setName('');
    setImportKey('');
    setLoading(false);
  };

  const handleSkip = () => {
    useTutorialStore.getState().skipStep('swarm-key');
    useTutorialStore.getState().skipStep('activate-key');
  };

  return (
    <TutorialStepCard
      stepNumber={3}
      title="Cle de reseau"
      description="Une cle de swarm cree un reseau prive entre les pairs qui la partagent. Vous pouvez aussi rester sur le reseau public."
      status={status}
      icon={<KeyRound className="w-3.5 h-3.5 text-amber-400" />}
      onSelect={onSelect}
    >
      {mode === 'choose' && (
        <div className="space-y-2">
          {swarmKeys.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              {swarmKeys.length} cle(s) enregistree(s)
            </div>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Generer
            </button>
            <button
              onClick={() => setMode('import')}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium bg-slate-700/50 text-slate-300 hover:bg-slate-700/80 transition-colors"
            >
              <Download className="w-3 h-3" />
              Importer
            </button>
          </div>
          <button
            onClick={handleSkip}
            className="text-[10px] text-slate-500 hover:text-slate-400 transition-colors"
          >
            <Globe className="w-3 h-3 inline mr-1" />
            Passer (reseau public)
          </button>
        </div>
      )}

      {mode === 'generate' && pendingKey && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500">Cle generee. Donnez-lui un nom :</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveGenerated()}
            placeholder="Nom de la cle (ex: mon-equipe)"
            className="w-full bg-slate-950/50 border border-slate-700/50 rounded px-2 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleSaveGenerated}
              disabled={!name.trim() || loading}
              className="px-2.5 py-1 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button
              onClick={() => { setMode('choose'); setPendingKey(null); }}
              className="px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-300"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {mode === 'import' && (
        <div className="space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la cle"
            className="w-full bg-slate-950/50 border border-slate-700/50 rounded px-2 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
          />
          <textarea
            value={importKey}
            onChange={(e) => setImportKey(e.target.value)}
            placeholder="Collez la cle swarm ici..."
            rows={3}
            className="w-full bg-slate-950/50 border border-slate-700/50 rounded px-2 py-1 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 resize-none font-mono"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleImport}
              disabled={!name.trim() || !importKey.trim() || loading}
              className="px-2.5 py-1 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Importer'}
            </button>
            <button
              onClick={() => { setMode('choose'); setImportKey(''); setName(''); }}
              className="px-2 py-1 rounded text-[10px] text-slate-500 hover:text-slate-300"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </TutorialStepCard>
  );
}

// ─── Step 4: Activate Key ───────────────────────────────────────

function Step4ActivateKey({ status, onSelect }: { status: 'pending' | 'active' | 'completed' | 'skipped'; onSelect: () => void }) {
  const swarmKeys = useStore((s) => s.swarmKeys);
  const activeSwarmKey = useStore((s) => s.activeSwarmKey);
  const [loading, setLoading] = useState<string | null>(null);

  const handleApply = async (name: string) => {
    setLoading(name);
    const result = await window.labAPI.ipfs.swarmKeyApply(name);
    if (result.success) {
      useStore.getState().setActiveSwarmKey(name);
      useStore.getState().setIpfsRunning(false);
      useStore.getState().setPeers([]);
    }
    setLoading(null);
  };

  const handleSkip = () => {
    useTutorialStore.getState().skipStep('activate-key');
  };

  return (
    <TutorialStepCard
      stepNumber={4}
      title="Activer le reseau prive"
      description="Selectionnez une cle pour creer un reseau prive. Seuls les pairs avec la meme cle pourront se connecter."
      status={status}
      icon={<Lock className="w-3.5 h-3.5 text-rose-400" />}
      onSelect={onSelect}
    >
      {swarmKeys.length === 0 ? (
        <p className="text-[10px] text-slate-500">
          Aucune cle enregistree. Revenez a l'etape 3 pour en creer une.
        </p>
      ) : (
        <div className="space-y-1.5">
          {swarmKeys.map((k) => (
            <div key={k.name} className="flex items-center justify-between gap-2 bg-slate-950/30 rounded px-2 py-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <KeyRound className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span className="text-[10px] text-slate-300 truncate">{k.name}</span>
                {activeSwarmKey === k.name && (
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">actif</span>
                )}
              </div>
              {activeSwarmKey !== k.name && (
                <button
                  onClick={() => handleApply(k.name)}
                  disabled={loading !== null}
                  className="text-[10px] text-indigo-300 hover:text-indigo-200 transition-colors flex-shrink-0"
                >
                  {loading === k.name ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Activer'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <button
        onClick={handleSkip}
        className="text-[10px] text-slate-500 hover:text-slate-400 transition-colors mt-1"
      >
        <Globe className="w-3 h-3 inline mr-1" />
        Passer (rester en reseau public)
      </button>
    </TutorialStepCard>
  );
}

// ─── Step 5: Start Daemon ───────────────────────────────────────

function Step5StartDaemon({ status, onSelect }: { status: 'pending' | 'active' | 'completed' | 'skipped'; onSelect: () => void }) {
  const ipfsRunning = useStore((s) => s.ipfsRunning);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await window.labAPI.ipfs.daemonStart();
      if (result.success) {
        useStore.getState().setIpfsRunning(true);
      } else {
        setError(result.error || 'Erreur au demarrage');
      }
    } catch (err) {
      setError(String(err));
    }
    setStarting(false);
  };

  return (
    <TutorialStepCard
      stepNumber={5}
      title="Demarrer IPFS"
      description="Lancez le daemon IPFS pour commencer la decouverte de pairs et la collaboration."
      status={status}
      icon={<Play className="w-3.5 h-3.5 text-emerald-400" />}
      onSelect={onSelect}
    >
      {ipfsRunning ? (
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
          <CheckCircle2 className="w-3 h-3" />
          Le daemon IPFS est en cours d'execution.
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={handleStart}
            disabled={starting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Demarrer le daemon
          </button>
          {error && (
            <p className="text-[10px] text-red-400">{error}</p>
          )}
        </div>
      )}
    </TutorialStepCard>
  );
}
