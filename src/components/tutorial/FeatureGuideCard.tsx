import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

interface FeatureGuideCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function FeatureGuideCard({
  title,
  description,
  icon,
  expanded,
  onToggle,
  children,
}: FeatureGuideCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-200',
        expanded ? 'border-indigo-500/30 bg-slate-800/60' : 'border-slate-700/30 bg-slate-800/40',
      )}
    >
      <button
        onClick={onToggle}
        className="flex items-center gap-2.5 w-full text-left p-3"
      >
        {icon}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-slate-200 block">{title}</span>
          {!expanded && (
            <span className="text-[10px] text-slate-500 block truncate mt-0.5">{description}</span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
          <div className="text-[11px] text-slate-300 leading-relaxed space-y-2">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
