# Lab — Editeur Jupyter Notebook

Editeur de notebooks Jupyter standalone, avec collaboration P2P en temps reel, gestion de packages Python, et interface mobile.

## requirements
- Node.js : https://nodejs.org/
- python 3 (privilégier 3.10) : https://www.python.org
- Jupyter Lab : https://jupyter.org/
- IPFS (interplanetary filesystem on p2p based) : https://docs.ipfs.tech/install/command-line/#install-official-binary-distributions


## Stack technique

| Couche | Technologie |
|--------|------------|
| Desktop | Electron 33 |
| Frontend | React 19 + TypeScript + Vite 7 |
| Style | Tailwind CSS 4 |
| Editeur | CodeMirror 6 (Python, Markdown) |
| State | Zustand 5 |
| Kernel | Jupyter Server (REST + WebSocket) |
| P2P | IPFS / Kubo (pubsub + swarm keys) |
| Mobile | PWA React (WebSocket bridge) |
| Packages | pip via subprocess |
| Build | electron-builder |

## Fonctionnalites

### Notebooks

- Creation, ouverture et sauvegarde de fichiers `.ipynb`
- Plusieurs notebooks ouverts simultanement (onglets)
- Cellules **code** (Python, syntax highlighting) et **markdown** (rendu live)
- Execution individuelle ou globale ("Run All")
- Operations sur les cellules : ajouter, supprimer, deplacer, dupliquer, changer de type
- Affichage des sorties : stdout/stderr, HTML, tracebacks, compteurs d'execution
- Auto-completion (toggle)
- Indicateur de modifications non sauvegardees

### Gestion du Kernel Jupyter

- Demarrage/arret du serveur Jupyter depuis l'app
- Restart et interruption du kernel
- Communication WebSocket (protocole Jupyter v5.3)
- Streaming des resultats d'execution en temps reel
- Indicateur de statut : idle, busy, starting, dead, disconnected

### Projets

- Creation et ouverture de projets (dossier avec `.lab/project.json`)
- Scan automatique des `.ipynb` dans le dossier
- Favoris persistants pour acces rapide
- Sidebar avec arborescence des notebooks du projet

### Environnement virtuel Python

- Creation automatique d'un `.venv` par projet a l'ouverture
- Reutilisation du venv existant si present
- Jupyter et pip utilisent automatiquement le Python du venv
- Changement de projet = changement de venv (Jupyter est redemarre)
- Isolation complete des dependances entre projets

### Packages Python (pip)

- Installation de packages depuis l'interface (Panel "Packages")
- Sortie pip en temps reel (streaming stdout/stderr)
- Liste des packages installes avec filtre de recherche
- Fonctionne dans le venv du projet actif

### Collaboration P2P (IPFS)

Protocole a 3 couches sur IPFS pubsub :

1. **Decouverte** — ping/pong pour detecter les pairs sur le reseau
2. **Manifestes** — partage de la liste des notebooks et de leurs exports (fonctions, classes)
3. **Documents** — synchronisation cellule par cellule en temps reel

**Fonctionnalites :**

- Detection automatique des pairs via IPFS pubsub
- Edition collaborative en temps reel (cellules, ajout, suppression, deplacement, changement de type)
- Curseurs distants avec couleurs par pair
- Indicateurs de presence (en ligne/hors ligne)
- Partage de notebooks par CID (upload IPFS)
- Protocole `%ask` pour demander du code a un pair
- Reseaux prives via swarm keys (generation, import, application)
- Historique synchronise entre pairs

### Historique et Undo/Redo

Systeme d'historique arborescent (DAG) :

- Arbre visuel navigable dans un panneau lateral
- Chaque action (edit, ajout, suppression, deplacement) cree un noeud
- Navigation : clic sur un noeud, Undo (`Cmd+Z`), Redo (`Cmd+Y`)
- Branches multiples avec memoire de la derniere branche utilisee
- Attribution des actions par pair en mode collaboratif
- Auto-nettoyage (max ~200 noeuds par notebook)

### Interface mobile (PWA)

Accessible depuis un telephone connecte au meme reseau :

- **Bridge WebSocket** sur le port 9100 avec authentification par PIN
- **Ecran de connexion** : saisie du PIN affiche sur le desktop
- **Liste des notebooks** avec badge de collaboration
- **Edition mobile** : visualisation et modification des cellules, execution
- **Controle kernel** : restart, interruption depuis le mobile
- **Historique** : navigation simplifiee (liste lineaire)
- **Packages** : installation pip depuis le mobile

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Cmd+N` | Nouveau notebook |
| `Cmd+O` | Ouvrir un notebook |
| `Cmd+S` | Sauvegarder |
| `Cmd+Shift+S` | Sauvegarder sous |
| `Cmd+Enter` | Executer la cellule |
| `Shift+Enter` | Executer + inserer cellule |
| `Cmd+Shift+R` | Redemarrer le kernel |
| `Cmd+I` | Interrompre le kernel |
| `Cmd+Z` / `Cmd+Y` | Undo / Redo |
| `Tab` / `Shift+Tab` | Cellule suivante / precedente |

## Demarrage

```bash
# Installer les dependances
npm install
cd mobile && npm install && cd ..

# Build complet (desktop + mobile)
npm run build:all

# Lancer l'app
npm start

# Mode developpement (hot reload)
npm run dev
```

## Variables d'environnement

| Variable | Description | Defaut |
|----------|-------------|--------|
| `JUPYTER_BIN` | Chemin vers le binaire jupyter | `jupyter` |
| `IPFS_BIN` | Chemin vers le binaire IPFS | `ipfs` |
| `IPFS_REPO` | Repertoire du repo IPFS | `~/.ipfs` |
| `NODE_ENV` | `development` active le hot reload Vite | — |

## Structure du projet

```
lab/
├── main.js                    # Process principal Electron
├── preload.js                 # Bridge IPC (window.labAPI)
├── src/
│   ├── App.tsx                # Composant racine
│   ├── types.ts               # Interfaces TypeScript
│   ├── components/
│   │   ├── Notebook.tsx       # Vue notebook + gestion des cellules
│   │   ├── Cell.tsx           # Rendu d'une cellule
│   │   ├── CellEditor.tsx     # Editeur CodeMirror
│   │   ├── CellOutput.tsx     # Affichage des sorties
│   │   ├── Toolbar.tsx        # Barre d'outils
│   │   ├── ProjectSidebar.tsx # Sidebar projets + favoris + pairs
│   │   ├── PeerPanel.tsx      # Gestion des pairs IPFS
│   │   ├── HistoryPanel.tsx   # Arbre d'historique visuel
│   │   ├── PipPanel.tsx       # Gestionnaire de packages
│   │   └── RemoteCursors.tsx  # Curseurs collaboratifs
│   ├── services/
│   │   ├── kernelService.ts   # Client Jupyter REST + WebSocket
│   │   ├── collabService.ts   # Protocole collab IPFS pubsub
│   │   ├── collabBridge.ts    # Orchestrateur de collaboration
│   │   └── codeShareService.ts # Protocole %ask
│   └── store/
│       ├── useStore.ts        # Store principal Zustand
│       └── useHistoryStore.ts # Store d'historique arborescent
├── mobile/
│   └── src/
│       ├── App.tsx            # App mobile
│       ├── components/        # UI mobile
│       └── services/
│           └── wsBridge.ts    # Client WebSocket vers le bridge
└── package.json
```

## Architecture de communication

```
┌─────────────────────────────────────────────────┐
│  Electron (main.js)                             │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Jupyter   │  │ IPFS     │  │ WS Bridge     │ │
│  │ Server    │  │ Daemon   │  │ (port 9100)   │ │
│  └─────┬────┘  └────┬─────┘  └──────┬────────┘ │
│        │ IPC        │ IPC           │ IPC       │
├────────┼────────────┼───────────────┼───────────┤
│  preload.js (window.labAPI)                     │
├─────────────────────────────────────────────────┤
│  React Renderer                                 │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│  │ Notebook  │  │ Collab   │  │ Bridge        │ │
│  │ + Kernel  │  │ Service  │  │ Handler       │ │
│  └──────────┘  └──────────┘  └───────┬───────┘ │
└──────────────────────────────────────┼──────────┘
                                       │ WebSocket
                              ┌────────┴────────┐
                              │  Mobile PWA     │
                              │  (React)        │
                              └─────────────────┘
```
