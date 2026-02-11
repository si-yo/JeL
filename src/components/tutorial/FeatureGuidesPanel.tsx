import { useTutorialStore, type FeatureGuide } from '../../store/useTutorialStore';
import { FeatureGuideCard } from './FeatureGuideCard';
import {
  Globe, Share2, Code, GitBranch, FileDown, Eye, Sparkles,
} from 'lucide-react';

export function FeatureGuidesPanel() {
  const activeGuide = useTutorialStore((s) => s.activeGuide);
  const setActiveGuide = useTutorialStore((s) => s.setActiveGuide);

  return (
    <div className="space-y-2">
      {/* P2P Basics */}
      <FeatureGuideCard
        title="Connexion P2P"
        description="Decouverte de pairs et connexion au reseau."
        icon={<Globe className="w-4 h-4 text-indigo-400 flex-shrink-0" />}
        expanded={activeGuide === 'p2p-basics'}
        onToggle={() => setActiveGuide('p2p-basics')}
      >
        <GuideP2PBasics />
      </FeatureGuideCard>

      {/* File Sharing */}
      <FeatureGuideCard
        title="Partage de fichiers"
        description="Partagez vos notebooks avec les pairs connectes."
        icon={<Share2 className="w-4 h-4 text-pink-400 flex-shrink-0" />}
        expanded={activeGuide === 'file-sharing'}
        onToggle={() => setActiveGuide('file-sharing')}
      >
        <GuideFileSharing />
      </FeatureGuideCard>

      {/* Notebooks & Jupyter */}
      <FeatureGuideCard
        title="Notebooks et Jupyter"
        description="Projets, notebooks et execution de code Python."
        icon={<Code className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
        expanded={activeGuide === 'notebooks-jupyter'}
        onToggle={() => setActiveGuide('notebooks-jupyter')}
      >
        <GuideNotebooks />
      </FeatureGuideCard>

      {/* Undo/Redo Tree */}
      <FeatureGuideCard
        title="Historique arborescent"
        description="Undo/redo illimite avec branches multiples."
        icon={<GitBranch className="w-4 h-4 text-violet-400 flex-shrink-0" />}
        expanded={activeGuide === 'undo-redo-tree'}
        onToggle={() => setActiveGuide('undo-redo-tree')}
      >
        <GuideHistory />
      </FeatureGuideCard>

      {/* PDF Export */}
      <FeatureGuideCard
        title="Export PDF"
        description="Exportez vos notebooks en PDF."
        icon={<FileDown className="w-4 h-4 text-orange-400 flex-shrink-0" />}
        expanded={activeGuide === 'pdf-export'}
        onToggle={() => setActiveGuide('pdf-export')}
      >
        <GuidePDF />
      </FeatureGuideCard>

      {/* View Mode */}
      <FeatureGuideCard
        title="Mode lecture"
        description="Presentation claire sans les controles d'edition."
        icon={<Eye className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
        expanded={activeGuide === 'view-mode'}
        onToggle={() => setActiveGuide('view-mode')}
      >
        <GuideViewMode />
      </FeatureGuideCard>

      {/* Advanced Features */}
      <FeatureGuideCard
        title="Fonctionnalites avancees"
        description="%use, %ask, liens, mobile, auto-completion."
        icon={<Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />}
        expanded={activeGuide === 'advanced-features'}
        onToggle={() => setActiveGuide('advanced-features')}
      >
        <GuideAdvanced />
      </FeatureGuideCard>
    </div>
  );
}

// ─── Individual Guide Contents ──────────────────────────────────

function GuideP2PBasics() {
  return (
    <>
      <p>Lab utilise IPFS pour creer un reseau pair-a-pair entre les utilisateurs.</p>
      <div className="space-y-1.5 mt-1">
        <Step label="Decouverte locale">
          Les pairs sur le meme reseau local sont decouverts automatiquement via mDNS.
        </Step>
        <Step label="Connexion manuelle">
          Dans le panneau Pairs (sidebar), collez l'adresse multiaddr d'un pair distant et cliquez Connecter.
          Demandez a votre pair son adresse depuis son panneau Pairs.
        </Step>
        <Step label="Reseau prive">
          Avec une cle de swarm commune, seuls les pairs partageant cette cle peuvent se voir.
          Ideal pour les equipes.
        </Step>
        <Step label="Reconexion automatique">
          Les adresses des pairs connectes sont sauvegardees. Lab tente de se reconnecter au demarrage.
        </Step>
      </div>
    </>
  );
}

function GuideFileSharing() {
  return (
    <>
      <p>Plusieurs mecanismes de partage sont disponibles :</p>
      <div className="space-y-1.5 mt-1">
        <Step label="Partager un notebook">
          Dans le panneau Pairs, cochez les notebooks que vous souhaitez rendre visibles.
          Les pairs connectes verront ces notebooks dans leur liste.
        </Step>
        <Step label="Ouvrir un notebook distant">
          Cliquez sur un notebook partage par un pair pour l'ouvrir en lecture/ecriture collaborative.
          Les modifications sont synchronisees en temps reel via pubsub.
        </Step>
        <Step label="Partage via CID">
          Le bouton Partager dans la toolbar publie le notebook sur IPFS et envoie le CID aux pairs.
          Utile pour partager une version figee.
        </Step>
        <Step label="%ask">
          Depuis une cellule de code, utilisez <Kbd>%ask alice utils.ipynb:ma_fonction</Kbd> pour
          demander du code a un pair.
        </Step>
      </div>
    </>
  );
}

function GuideNotebooks() {
  return (
    <>
      <p>Lab est un editeur Jupyter complet avec gestion de projets.</p>
      <div className="space-y-1.5 mt-1">
        <Step label="Creer un projet">
          Menu Fichier &rarr; Nouveau projet, ou bouton "Nouveau Projet" dans la sidebar.
          Un projet est un dossier avec un environnement Python (venv) dedie.
        </Step>
        <Step label="Creer un notebook">
          <Kbd>Ctrl+N</Kbd> ou Menu Fichier &rarr; Nouveau notebook.
          Un notebook est cree en memoire et peut etre sauvegarde avec <Kbd>Ctrl+S</Kbd>.
        </Step>
        <Step label="Demarrer Jupyter">
          Bouton <Kbd>Start</Kbd> dans la toolbar (icone eclair).
          Jupyter Lab demarre avec le venv du projet pour l'execution Python.
        </Step>
        <Step label="Executer des cellules">
          <Kbd>Shift+Enter</Kbd> pour executer la cellule courante.
          Bouton Run All pour executer toutes les cellules.
        </Step>
        <Step label="Lier des notebooks">
          Utilisez <Kbd>%use helpers.ipynb</Kbd> pour importer le code d'un autre notebook
          dans le kernel courant avant l'execution.
        </Step>
      </div>
    </>
  );
}

function GuideHistory() {
  return (
    <>
      <p>
        Contrairement a un undo lineaire classique, Lab utilise un historique en arbre.
        Chaque modification cree un noeud, et les branches paralleles sont conservees.
      </p>
      <div className="space-y-1.5 mt-1">
        <Step label="Undo / Redo">
          <Kbd>Ctrl+Alt+Z</Kbd> pour annuler, <Kbd>Ctrl+Alt+Shift+Z</Kbd> pour retablir.
          Cela navigue dans l'arbre d'historique.
        </Step>
        <Step label="Panneau historique">
          <Kbd>Ctrl+Alt+H</Kbd> ou bouton dans la toolbar pour ouvrir la visualisation de l'arbre.
          Cliquez sur n'importe quel noeud pour restaurer cet etat.
        </Step>
        <Step label="Branches">
          Si vous annulez puis faites une nouvelle modification, une branche est creee.
          Les deux chemins sont conserves et navigables.
        </Step>
        <Step label="Collaboration">
          Les modifications des pairs creent aussi des noeuds dans l'arbre,
          marques avec leur pseudo.
        </Step>
      </div>
    </>
  );
}

function GuidePDF() {
  return (
    <>
      <p>Exportez vos notebooks en documents PDF.</p>
      <div className="space-y-1.5 mt-1">
        <Step label="Export simple">
          Bouton PDF dans la toolbar (ou Menu Fichier &rarr; Exporter en PDF).
          Exporte le notebook courant.
        </Step>
        <Step label="Portees d'export">
          Choisissez entre exporter le notebook courant seul, le notebook avec ses
          dependances (%use), ou tout le projet.
        </Step>
        <Step label="Mode lecture">
          Activez le mode lecture avant l'export pour un rendu plus propre
          sans les controles d'edition.
        </Step>
      </div>
    </>
  );
}

function GuideViewMode() {
  return (
    <>
      <p>Le mode lecture offre une vue propre du notebook sans les controles d'edition.</p>
      <div className="space-y-1.5 mt-1">
        <Step label="Activer">
          Bouton oeil dans la toolbar pour basculer entre edition et lecture.
        </Step>
        <Step label="Cellules masquees">
          Dans le panneau cellule (bouton List dans la toolbar), vous pouvez marquer
          des cellules comme masquees. Elles disparaissent en mode lecture.
        </Step>
        <Step label="Presentation">
          Ideal pour presenter un notebook a d'autres personnes ou pour relecture.
          Le markdown est rendu et le code est en lecture seule avec coloration syntaxique.
        </Step>
      </div>
    </>
  );
}

function GuideAdvanced() {
  return (
    <>
      <div className="space-y-1.5">
        <Step label="%use — Import de notebooks">
          <Kbd>%use notebook.ipynb</Kbd> importe tout le code.
          <Kbd>%use notebook.ipynb:2</Kbd> importe la cellule a l'index 2.
          <Kbd>%use notebook.ipynb:ma_fonction</Kbd> importe la definition correspondante.
        </Step>
        <Step label="%ask — Code distant">
          <Kbd>%ask alice utils.ipynb</Kbd> demande le code a un pair connecte.
          Le code recu est analyse avant execution pour la securite.
          Utilisez <Kbd>--force</Kbd> pour bypasser la sandbox.
        </Step>
        <Step label="[[liens]] — Liens inter-notebooks">
          Dans une cellule markdown, <Kbd>[[resultats.ipynb]]</Kbd> cree un lien cliquable.
          <Kbd>[[analyse.ipynb#cellId]]</Kbd> pointe vers une cellule specifique.
        </Step>
        <Step label="Acces mobile">
          Dans le panneau Pairs, activez l'acces mobile.
          Un serveur demarre sur le port 9100 avec un PIN de securite.
          Ouvrez l'URL affichee sur votre telephone pour editer a distance.
        </Step>
        <Step label="Auto-completion">
          Bouton Auto dans la toolbar ou <Kbd>Ctrl+Espace</Kbd>.
          Propose des completions Python (builtins, keywords, modules),
          les commandes %use, et la syntaxe markdown.
        </Step>
      </div>
    </>
  );
}

// ─── Shared UI helpers ──────────────────────────────────────────

function Step({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded bg-slate-950/30 p-2">
      <span className="text-[10px] font-semibold text-indigo-300 block mb-0.5">{label}</span>
      <span className="text-[10px] text-slate-400 leading-relaxed">{children}</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1 py-0.5 rounded bg-slate-800 text-indigo-300 text-[10px] font-mono">
      {children}
    </code>
  );
}
