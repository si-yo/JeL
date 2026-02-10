import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface Props {
  onConnect: (host: string, pin: string) => Promise<void>;
  error: string | null;
}

export function ConnectionScreen({ onConnect, error }: Props) {
  const [host, setHost] = useState('');
  const [pin, setPin] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Try to extract from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setPin(token);
      const h = window.location.host;
      setHost(h);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !pin) return;
    setConnecting(true);
    try {
      await onConnect(host, pin);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <Wifi className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Lab Mobile</h1>
          <p className="text-sm text-slate-500 mt-1">Connectez-vous a votre instance Lab</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Adresse (IP:port)</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.42:9100"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Code PIN</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm text-center tracking-[0.3em] font-mono text-lg placeholder:text-slate-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
              <span className="text-xs text-red-300">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!host || !pin || connecting}
            className="w-full py-2.5 rounded-lg bg-indigo-500 text-white font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-400 transition-colors flex items-center justify-center gap-2"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connexion...
              </>
            ) : (
              'Se connecter'
            )}
          </button>
        </form>

        <p className="text-[10px] text-slate-600 text-center mt-6">
          L'adresse et le PIN sont affiches dans le panneau Peers de Lab desktop.
        </p>
      </div>
    </div>
  );
}
