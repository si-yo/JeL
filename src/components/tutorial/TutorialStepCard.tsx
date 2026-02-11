import { Check, ChevronRight, SkipForward } from 'lucide-react';
import { cn } from '../../utils/cn';

interface TutorialStepCardProps {
  stepNumber: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'skipped';
  icon: React.ReactNode;
  onSelect?: () => void;
  children?: React.ReactNode;
}

export function TutorialStepCard({
  stepNumber,
  title,
  description,
  status,
  icon,
  onSelect,
  children,
}: TutorialStepCardProps) {
  const isActive = status === 'active';
  const isCompleted = status === 'completed';
  const isSkipped = status === 'skipped';

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-all duration-200',
        isActive && 'border-indigo-500/50 bg-indigo-500/5',
        isCompleted && 'border-emerald-500/30 bg-emerald-500/5',
        isSkipped && 'border-slate-600/30 bg-slate-800/30 opacity-60',
        !isActive && !isCompleted && !isSkipped && 'border-slate-700/30 bg-slate-800/40',
      )}
    >
      <button
        onClick={onSelect}
        className="flex items-center gap-2.5 w-full text-left"
      >
        {/* Step number / status icon */}
        <div
          className={cn(
            'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold',
            isActive && 'bg-indigo-500/20 text-indigo-300',
            isCompleted && 'bg-emerald-500/20 text-emerald-400',
            isSkipped && 'bg-slate-600/20 text-slate-500',
            !isActive && !isCompleted && !isSkipped && 'bg-slate-700/50 text-slate-500',
          )}
        >
          {isCompleted ? (
            <Check className="w-3.5 h-3.5" />
          ) : isSkipped ? (
            <SkipForward className="w-3 h-3" />
          ) : (
            stepNumber
          )}
        </div>

        {/* Icon + title */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {icon}
          <span
            className={cn(
              'text-xs font-medium truncate',
              isActive ? 'text-slate-200' : isCompleted ? 'text-emerald-300' : 'text-slate-400',
            )}
          >
            {title}
          </span>
        </div>

        {isActive && <ChevronRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />}
      </button>

      {/* Description + interactive content */}
      {isActive && (
        <div className="mt-2.5 ml-8.5 space-y-2.5">
          <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
          {children}
        </div>
      )}
    </div>
  );
}
