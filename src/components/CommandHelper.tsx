import { useState } from 'react';
import { HelpCircle, X, Code, FileText, Link2, Share2, Zap, Sparkles, Shield, Smartphone } from 'lucide-react';

interface Command {
  name: string;
  syntax: string;
  description: string;
  examples: string[];
  icon: React.ReactNode;
}

const COMMANDS: Command[] = [
  {
    name: '%use',
    syntax: '%use <notebook.ipynb>[:<selecteur>]',
    description:
      "Importe et execute le code d'un autre notebook dans le kernel courant. Le code est injecte avant l'execution de la cellule.",
    examples: [
      '%use utils.ipynb',
      '%use helpers.ipynb:2',
      '%use math_tools.ipynb:calculer_moyenne',
    ],
    icon: <Code className="w-4 h-4 text-indigo-400" />,
  },
  {
    name: '%use (tout)',
    syntax: '%use notebook.ipynb',
    description:
      "Execute toutes les cellules de code du notebook cible. Les fonctions, classes et variables definies deviennent disponibles dans le kernel courant.",
    examples: ['%use config.ipynb', '%use ../shared/utils.ipynb'],
    icon: <FileText className="w-4 h-4 text-emerald-400" />,
  },
  {
    name: '%use (index)',
    syntax: '%use notebook.ipynb:N',
    description:
      "Execute uniquement la cellule de code a l'index N (base 0) du notebook cible. Utile pour importer une seule fonction ou bloc.",
    examples: ['%use utils.ipynb:0', '%use helpers.ipynb:3'],
    icon: <Zap className="w-4 h-4 text-amber-400" />,
  },
  {
    name: '%use (fonction)',
    syntax: '%use notebook.ipynb:nom_fonction',
    description:
      "Execute les cellules qui contiennent la definition (def ou class) correspondante. Cherche 'def nom_fonction' ou 'class nom_fonction'.",
    examples: [
      '%use math.ipynb:calculer_moyenne',
      '%use models.ipynb:NeuralNet',
    ],
    icon: <Code className="w-4 h-4 text-cyan-400" />,
  },
  {
    name: '[[liens]]',
    syntax: '[[notebook.ipynb]] ou [[notebook.ipynb#cellId]]',
    description:
      "Dans une cellule markdown, cree un lien cliquable vers un autre notebook du projet. S'affiche dans la barre de liens.",
    examples: ['[[resultats.ipynb]]', '[[analyse.ipynb#conclusion]]'],
    icon: <Link2 className="w-4 h-4 text-violet-400" />,
  },
  {
    name: '%ask',
    syntax: '%ask <peer> <notebook.ipynb>[:<selecteur>]',
    description:
      "Demande et execute du code depuis un peer connecte. Le peer doit avoir active le partage du notebook. Le code recu est valide par analyse statique avant execution.",
    examples: [
      '%ask alice utils.ipynb',
      '%ask alice utils.ipynb:calculer_moyenne',
      '%ask alice utils.ipynb:3',
      '%ask --force alice utils.ipynb  (bypass sandbox)',
    ],
    icon: <Shield className="w-4 h-4 text-rose-400" />,
  },
  {
    name: 'Partage CID',
    syntax: 'Bouton Partager (toolbar)',
    description:
      "Publie le notebook courant sur IPFS et partage le CID avec les peers connectes via pubsub. Necessite IPFS actif.",
    examples: [],
    icon: <Share2 className="w-4 h-4 text-pink-400" />,
  },
  {
    name: 'Acces mobile',
    syntax: 'PeerPanel → Activer acces mobile',
    description:
      "Demarre un serveur WebSocket sur le port 9100. Les appareils mobiles se connectent via le navigateur avec l'URL et le PIN affiches. Permet d'editer et executer des cellules depuis un telephone.",
    examples: [
      'http://192.168.1.42:9100?token=123456',
    ],
    icon: <Smartphone className="w-4 h-4 text-cyan-400" />,
  },
  {
    name: 'Auto-completion',
    syntax: 'Bouton Auto (toolbar) ou Ctrl+Espace',
    description:
      "Active/desactive l'auto-completion dans les cellules. Propose des completions Python (builtins, keywords, modules), les commandes %use, et la syntaxe markdown.",
    examples: [
      'pri → print  (Python builtin)',
      'imp → import  (keyword)',
      '%u → %use notebook.ipynb  (commande)',
    ],
    icon: <Sparkles className="w-4 h-4 text-violet-400" />,
  },
];

export function CommandHelper() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 p-2.5 rounded-full bg-slate-800 border border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors shadow-lg z-50"
        title="Commandes disponibles"
      >
        <HelpCircle className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-[420px] max-h-[80vh] rounded-xl bg-slate-900 border border-slate-700/50 shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-slate-200">Commandes Lab</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Commands list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {COMMANDS.map((cmd) => (
          <div
            key={cmd.name}
            className="rounded-lg bg-slate-800/60 border border-slate-700/30 p-3"
          >
            <div className="flex items-center gap-2 mb-1.5">
              {cmd.icon}
              <span className="text-xs font-semibold text-slate-200">{cmd.name}</span>
            </div>
            <code className="block text-[11px] text-indigo-300 bg-slate-950/50 rounded px-2 py-1 mb-2 font-mono">
              {cmd.syntax}
            </code>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
              {cmd.description}
            </p>
            {cmd.examples.length > 0 && (
              <div className="space-y-1">
                {cmd.examples.map((ex, i) => (
                  <code
                    key={i}
                    className="block text-[10px] text-slate-500 bg-slate-950/30 rounded px-2 py-0.5 font-mono"
                  >
                    {ex}
                  </code>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-slate-700/30 text-[10px] text-slate-600">
        Les chemins sont relatifs au notebook courant ou a la racine du projet.
      </div>
    </div>
  );
}
