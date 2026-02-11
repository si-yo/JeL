import { useEffect } from 'react';
import { useTutorialStore, type TutorialSection } from '../../store/useTutorialStore';
import { NetworkSetupWizard } from './NetworkSetupWizard';
import { FeatureGuidesPanel } from './FeatureGuidesPanel';
import { X, Wifi, BookOpen } from 'lucide-react';
import { cn } from '../../utils/cn';

const TABS: { id: TutorialSection; label: string; icon: React.ReactNode }[] = [
  { id: 'network-setup', label: 'Configuration Reseau', icon: <Wifi className="w-3.5 h-3.5" /> },
  { id: 'feature-guides', label: 'Decouvrir', icon: <BookOpen className="w-3.5 h-3.5" /> },
];

export function TutorialOverlay() {
  const isOpen = useTutorialStore((s) => s.isOpen);
  const activeSection = useTutorialStore((s) => s.activeSection);
  const setActiveSection = useTutorialStore((s) => s.setActiveSection);
  const close = useTutorialStore((s) => s.close);
  const markTutorialSeen = useTutorialStore((s) => s.markTutorialSeen);

  const handleClose = () => {
    markTutorialSeen();
    close();
  };

  // Escape to close, Ctrl/Cmd+Alt+T to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && isOpen) {
        // Don't close if user is typing in an input
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-14 bottom-4 w-[440px] z-50 flex flex-col rounded-xl bg-slate-900 border border-slate-700/50 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">Guide interactif</span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700/50 px-2 gap-1 py-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
              activeSection === tab.id
                ? 'bg-indigo-500/15 text-indigo-300'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeSection === 'network-setup' ? (
          <NetworkSetupWizard />
        ) : (
          <FeatureGuidesPanel />
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-700/30 text-[10px] text-slate-600">
        Ctrl+Alt+T pour ouvrir/fermer &middot; Escape pour fermer
      </div>
    </div>
  );
}
