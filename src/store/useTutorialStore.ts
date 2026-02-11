import { create } from 'zustand';

export type TutorialSection = 'network-setup' | 'feature-guides';

export type NetworkStep =
  | 'check-ipfs'
  | 'set-pseudo'
  | 'swarm-key'
  | 'activate-key'
  | 'start-daemon';

export type FeatureGuide =
  | 'p2p-basics'
  | 'file-sharing'
  | 'notebooks-jupyter'
  | 'undo-redo-tree'
  | 'pdf-export'
  | 'view-mode'
  | 'advanced-features';

const NETWORK_STEPS: NetworkStep[] = [
  'check-ipfs',
  'set-pseudo',
  'swarm-key',
  'activate-key',
  'start-daemon',
];

interface TutorialStore {
  isOpen: boolean;
  hasSeenTutorial: boolean;
  activeSection: TutorialSection;
  networkStep: NetworkStep;
  activeGuide: FeatureGuide | null;

  ipfsRepoExists: boolean | null;
  ipfsInitializing: boolean;
  ipfsInitError: string | null;

  completedNetworkSteps: NetworkStep[];
  skippedSteps: NetworkStep[];

  open: () => void;
  close: () => void;
  setActiveSection: (section: TutorialSection) => void;
  setNetworkStep: (step: NetworkStep) => void;
  setActiveGuide: (guide: FeatureGuide | null) => void;
  setIpfsRepoExists: (exists: boolean) => void;
  setIpfsInitializing: (v: boolean) => void;
  setIpfsInitError: (err: string | null) => void;
  markStepCompleted: (step: NetworkStep) => void;
  skipStep: (step: NetworkStep) => void;
  markTutorialSeen: () => void;
  advanceToNextStep: () => void;
}

export const useTutorialStore = create<TutorialStore>((set, get) => ({
  isOpen: false,
  hasSeenTutorial: localStorage.getItem('lab:tutorialSeen') === 'true',
  activeSection: 'network-setup',
  networkStep: 'check-ipfs',
  activeGuide: null,

  ipfsRepoExists: null,
  ipfsInitializing: false,
  ipfsInitError: null,

  completedNetworkSteps: [],
  skippedSteps: [],

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  setActiveSection: (section) => set({ activeSection: section }),
  setNetworkStep: (step) => set({ networkStep: step }),
  setActiveGuide: (guide) => set((s) => ({ activeGuide: s.activeGuide === guide ? null : guide })),

  setIpfsRepoExists: (exists) => set({ ipfsRepoExists: exists }),
  setIpfsInitializing: (v) => set({ ipfsInitializing: v }),
  setIpfsInitError: (err) => set({ ipfsInitError: err }),

  markStepCompleted: (step) =>
    set((s) => {
      if (s.completedNetworkSteps.includes(step)) return s;
      return { completedNetworkSteps: [...s.completedNetworkSteps, step] };
    }),

  skipStep: (step) =>
    set((s) => {
      if (s.skippedSteps.includes(step)) return s;
      return { skippedSteps: [...s.skippedSteps, step] };
    }),

  markTutorialSeen: () => {
    localStorage.setItem('lab:tutorialSeen', 'true');
    set({ hasSeenTutorial: true });
  },

  advanceToNextStep: () => {
    const { networkStep, completedNetworkSteps, skippedSteps } = get();
    const currentIdx = NETWORK_STEPS.indexOf(networkStep);
    for (let i = currentIdx + 1; i < NETWORK_STEPS.length; i++) {
      const s = NETWORK_STEPS[i];
      if (!completedNetworkSteps.includes(s) && !skippedSteps.includes(s)) {
        set({ networkStep: s });
        return;
      }
    }
  },
}));
