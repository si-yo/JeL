import { cn } from '../utils/cn';
import type { KernelState } from '../types';
import { Circle } from 'lucide-react';

const stateLabels: Record<KernelState, string> = {
  idle: 'Pret',
  busy: 'Execution...',
  starting: 'Demarrage...',
  dead: 'Arrete',
  disconnected: 'Deconnecte',
};

const stateColors: Record<KernelState, string> = {
  idle: 'text-emerald-400',
  busy: 'text-amber-400',
  starting: 'text-blue-400',
  dead: 'text-red-400',
  disconnected: 'text-slate-500',
};

export function KernelStatus({ state }: { state: KernelState }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Circle
        className={cn('w-2.5 h-2.5 fill-current', stateColors[state])}
      />
      <span className="text-slate-400">{stateLabels[state]}</span>
    </div>
  );
}
