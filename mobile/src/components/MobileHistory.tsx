import { Undo2, Redo2, X, Edit3, Plus, Trash2, ArrowUpDown, Type, GitBranch } from 'lucide-react';
import { bridge } from '../services/wsBridge';
import type { HistoryData, HistoryNodeLight } from '../App';

interface Props {
  notebookId: string;
  historyData: HistoryData;
  onClose: () => void;
}

function actionLabel(action: HistoryNodeLight['action']): { icon: typeof Edit3; text: string } {
  switch (action.type) {
    case 'init': return { icon: GitBranch, text: 'Init' };
    case 'cell-update': return { icon: Edit3, text: 'Edit' };
    case 'cell-add': return { icon: Plus, text: `+ ${action.cellType || 'cell'}` };
    case 'cell-delete': return { icon: Trash2, text: 'Suppr' };
    case 'cell-move': return { icon: ArrowUpDown, text: action.direction === 'up' ? 'Haut' : 'Bas' };
    case 'cell-type-change': return { icon: Type, text: 'Type' };
    default: return { icon: Edit3, text: action.type };
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Build a linear path from root to deepest preferred node, collecting branches */
function buildLinearList(data: HistoryData): HistoryNodeLight[] {
  const nodes: HistoryNodeLight[] = [];
  const allNodes = Object.values(data.nodes);

  // Sort all nodes by timestamp
  allNodes.sort((a, b) => a.timestamp - b.timestamp);
  return allNodes;
}

export function MobileHistory({ notebookId, historyData, onClose }: Props) {
  const nodes = buildLinearList(historyData);
  const currentNode = historyData.nodes[historyData.currentNodeId];
  const canUndo = !!currentNode?.parentId;
  const canRedo = (currentNode?.children.length ?? 0) > 0;

  return (
    <div className="bg-slate-900/95 border-b border-slate-700/50 max-h-[50vh] flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/30">
        <span className="text-xs font-medium text-slate-300 flex-1">
          Historique ({nodes.length})
        </span>
        <button
          onClick={() => bridge.historyUndo(notebookId)}
          disabled={!canUndo}
          className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30"
          title="Undo"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => bridge.historyRedo(notebookId)}
          disabled={!canRedo}
          className="p-1 rounded text-slate-400 hover:text-slate-200 disabled:opacity-30"
          title="Redo"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-500 hover:text-slate-300"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto">
        {nodes.map((node) => {
          const isCurrent = node.id === historyData.currentNodeId;
          const { icon: Icon, text } = actionLabel(node.action);
          const hasBranch = node.children.length > 1;

          return (
            <button
              key={node.id}
              onClick={() => {
                if (!isCurrent) bridge.historyGoto(notebookId, node.id);
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                isCurrent
                  ? 'bg-violet-500/15 border-l-2 border-violet-400'
                  : 'hover:bg-slate-800/60 border-l-2 border-transparent'
              }`}
            >
              <Icon className={`w-3 h-3 shrink-0 ${isCurrent ? 'text-violet-400' : 'text-slate-500'}`} />
              <span className={`text-[11px] flex-1 truncate ${isCurrent ? 'text-violet-300' : 'text-slate-400'}`}>
                {text}
                {node.peerName && <span className="text-slate-600 ml-1">({node.peerName})</span>}
                {hasBranch && <span className="text-amber-500/70 ml-1">{node.children.length} br.</span>}
              </span>
              <span className="text-[9px] text-slate-600 shrink-0">{formatTime(node.timestamp)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
