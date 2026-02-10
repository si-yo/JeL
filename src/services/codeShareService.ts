import type { CollabMessage, ShareManifest, SharedNotebookInfo } from '../types';
import { CollabService } from './collabService';
import { useStore } from '../store/useStore';

/**
 * Code Share Service
 * Manages code sharing manifests and %ask request/response protocol.
 *
 * Uses collabService.roomTopic for all pubsub, and collabService.peerId
 * as the local identity — never references projectId for topics.
 */
export interface SharedCell {
  cell_type: 'code' | 'markdown';
  source: string;
}

export class CodeShareService {
  private collabService: CollabService;
  private pendingRequests = new Map<string, {
    resolve: (code: string) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private pendingNotebookRequests = new Map<string, {
    resolve: (cells: SharedCell[]) => void;
    reject: (err: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private onManifestReceivedCb: (() => void) | null = null;

  constructor(collabService: CollabService) {
    this.collabService = collabService;
  }

  /** Register a callback invoked when a peer's manifest is received (for reciprocal broadcast) */
  onManifestReceived(cb: () => void): void {
    this.onManifestReceivedCb = cb;
  }

  /**
   * Build and publish manifest of shared notebooks
   */
  async publishManifest(): Promise<void> {
    const { sharedNotebooks, notebooks, collabPseudo, currentProject } = useStore.getState();

    console.log(`[Collab:Share] publishManifest — pseudo="${collabPseudo}" sharedNotebooks=${sharedNotebooks.length} openNotebooks=${notebooks.length}`);

    const sharedInfos: SharedNotebookInfo[] = [];

    for (const sharedPath of sharedNotebooks) {
      const nb = notebooks.find((n) => n.filePath === sharedPath || n.fileName === sharedPath);
      if (!nb) {
        console.log(`[Collab:Share] Shared path "${sharedPath}" — no matching open notebook found`);
        continue;
      }

      const allCells = nb.data.cells.filter((c) => c.source.trim());
      const codeCells = allCells.filter((c) => c.cell_type === 'code');
      const exports: string[] = [];

      for (const cell of codeCells) {
        const defMatches = cell.source.matchAll(/(?:def|class)\s+(\w+)/g);
        for (const m of defMatches) {
          exports.push(m[1]);
        }
      }

      // Always use relative path (never leak absolute filesystem paths)
      let relPath: string;
      if (nb.filePath && currentProject && nb.filePath.startsWith(currentProject.path + '/')) {
        relPath = nb.filePath.replace(currentProject.path + '/', '');
      } else {
        const raw = nb.filePath || nb.fileName;
        relPath = raw.includes('/') ? raw.split('/').pop()! : raw;
      }

      sharedInfos.push({
        path: relPath,
        name: nb.fileName,
        cellCount: allCells.length,
        exports,
        shareMode: 'full',
      });
      console.log(`[Collab:Share] + notebook "${nb.fileName}" (${allCells.length} cells: ${codeCells.length} code + ${allCells.length - codeCells.length} md, ${exports.length} exports)`);
    }

    const peerId = this.collabService.peerId;
    const manifest: ShareManifest = {
      peerId,
      peerName: collabPseudo || currentProject?.name || '',
      notebooks: sharedInfos,
    };

    const msg: CollabMessage = {
      type: 'share-manifest',
      from: peerId,
      notebookPath: '',
      data: { manifest },
      timestamp: Date.now(),
    };

    const topic = this.collabService.roomTopic;
    console.log(`[Collab:Share] >> Publishing manifest on topic="${topic}" peerId="${peerId.slice(0, 16)}..." peerName="${manifest.peerName}" notebooks=${sharedInfos.length}`);
    const result = await window.labAPI.ipfs.pubsubPublish({
      topic,
      data: JSON.stringify(msg),
    });
    console.log(`[Collab:Share] >> pubsubPublish result:`, result);
  }

  /**
   * Handle incoming share-manifest message
   */
  handleShareManifest(msg: CollabMessage): void {
    const { manifest } = msg.data as { manifest: ShareManifest };
    console.log(`[Collab:Share] << Received manifest from "${manifest.peerName}" (${manifest.peerId.slice(0, 16)}...) with ${manifest.notebooks.length} notebook(s)`);
    for (const nb of manifest.notebooks) {
      console.log(`[Collab:Share]    - "${nb.name}" path="${nb.path}" exports=[${nb.exports.join(',')}]`);
    }
    useStore.getState().setPeerManifest(manifest.peerId, manifest);
    console.log(`[Collab:Share] Store updated — peerManifests keys:`, Object.keys(useStore.getState().peerManifests));

    // Layer 2: notify orchestrator to reciprocally broadcast our manifest
    this.onManifestReceivedCb?.();
  }

  /**
   * Handle incoming code-request — respond with code from shared notebooks
   */
  async handleCodeRequest(msg: CollabMessage): Promise<void> {
    const { requestId, targetPeer, notebookPath, selector, fullNotebook } = msg.data as {
      requestId: string;
      targetPeer: string;
      notebookPath: string;
      selector?: string;
      fullNotebook?: boolean;
    };

    const ourId = this.collabService.peerId;
    const { collabPseudo, currentProject } = useStore.getState();
    const ourName = collabPseudo || currentProject?.name || '';

    console.log(`[Collab:Share] << code-request reqId=${requestId} targetPeer="${targetPeer}" nb="${notebookPath}" selector="${selector || '*'}" fullNotebook=${!!fullNotebook}`);
    console.log(`[Collab:Share]    ourId="${ourId.slice(0, 16)}..." ourName="${ourName}"`);

    // Check if this request is for us
    if (targetPeer !== ourId && targetPeer !== ourName) {
      console.log(`[Collab:Share]    -> Not for us, ignoring`);
      return;
    }

    const { sharedNotebooks, notebooks } = useStore.getState();

    // Find the notebook (match by full path, relative path, or filename)
    const nb = notebooks.find((n) => {
      const p = n.filePath || n.fileName;
      if (!sharedNotebooks.includes(p)) return false;
      if (p === notebookPath || n.fileName === notebookPath) return true;
      // Match relative path: /home/user/proj/note.ipynb ends with note.ipynb
      if (p.endsWith('/' + notebookPath)) return true;
      // Match filename extracted from request path
      const reqFile = notebookPath.includes('/') ? notebookPath.split('/').pop() : notebookPath;
      const nbFile = p.includes('/') ? p.split('/').pop() : p;
      return reqFile === nbFile;
    });

    let code: string | null = null;
    let cells: SharedCell[] | null = null;
    let error: string | undefined;

    if (!nb) {
      error = `Notebook '${notebookPath}' non partage ou introuvable`;
      console.log(`[Collab:Share]    -> Notebook not found. sharedNotebooks:`, sharedNotebooks);
    } else {
      console.log(`[Collab:Share]    -> Found notebook "${nb.fileName}"`);

      if (fullNotebook && !selector) {
        // Full notebook request: send ALL cells (code + markdown)
        const allCells = nb.data.cells.filter((c) => c.source.trim());
        cells = allCells.map((c) => ({ cell_type: c.cell_type as 'code' | 'markdown', source: c.source }));
        console.log(`[Collab:Share]    -> Full notebook: ${cells.length} cells (${cells.filter(c => c.cell_type === 'code').length} code + ${cells.filter(c => c.cell_type === 'markdown').length} md)`);
      } else {
        // Selector-based or legacy request: code cells only
        const codeCells = nb.data.cells.filter((c) => c.cell_type === 'code' && c.source.trim());

        if (!selector) {
          code = codeCells.map((c) => c.source).join('\n\n');
        } else {
          const idx = parseInt(selector, 10);
          if (!isNaN(idx)) {
            const cell = codeCells[idx];
            code = cell ? cell.source : null;
            if (!code) error = `Cellule index ${idx} introuvable`;
          } else {
            const pattern = new RegExp(`(?:def|class)\\s+${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            const matched = codeCells.filter((c) => pattern.test(c.source));
            if (matched.length > 0) {
              code = matched.map((c) => c.source).join('\n\n');
            } else {
              error = `'${selector}' non trouve dans ${notebookPath}`;
            }
          }
        }
      }
    }

    console.log(`[Collab:Share]    -> Responding: ${cells ? `cells(${cells.length})` : code ? `code(${code.length} chars)` : `error="${error}"`}`);

    const response: CollabMessage = {
      type: 'code-response',
      from: ourId,
      notebookPath,
      data: { requestId, code, cells, error },
      timestamp: Date.now(),
    };

    await window.labAPI.ipfs.pubsubPublish({
      topic: this.collabService.roomTopic,
      data: JSON.stringify(response),
    });
  }

  /**
   * Handle incoming code-response
   */
  handleCodeResponse(msg: CollabMessage): void {
    const { requestId, code, cells, error } = msg.data as {
      requestId: string;
      code: string | null;
      cells?: SharedCell[];
      error?: string;
    };

    console.log(`[Collab:Share] << code-response reqId=${requestId} ${cells ? `cells(${cells.length})` : code ? `code(${code.length})` : `error="${error}"`}`);

    // Check notebook requests first (structured cell data)
    const pendingNb = this.pendingNotebookRequests.get(requestId);
    if (pendingNb) {
      clearTimeout(pendingNb.timeout);
      this.pendingNotebookRequests.delete(requestId);
      if (error || !cells) {
        pendingNb.reject(new Error(error || 'Aucune donnee recue'));
      } else {
        pendingNb.resolve(cells);
      }
      return;
    }

    // Code-only requests (%ask)
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.log(`[Collab:Share]    -> No pending request for this ID`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    if (error || code === null) {
      pending.reject(new Error(error || 'Aucun code recu'));
    } else {
      pending.resolve(code);
    }
  }

  /**
   * Request code from a peer (used by %ask resolver).
   * Retries up to 3 times (8s per attempt) to handle pubsub mesh delays.
   */
  async requestCode(targetPeer: string, notebookPath: string, selector?: string): Promise<string> {
    const maxAttempts = 3;
    const timeoutMs = 8000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ourId = this.collabService.peerId;

      console.log(`[Collab:Share] >> code-request (attempt ${attempt}/${maxAttempts}) reqId=${requestId} targetPeer="${targetPeer.slice(0, 16)}..." nb="${notebookPath}" selector="${selector || '*'}"`);

      const msg: CollabMessage = {
        type: 'code-request',
        from: ourId,
        notebookPath,
        data: { requestId, targetPeer, notebookPath, selector },
        timestamp: Date.now(),
      };

      await window.labAPI.ipfs.pubsubPublish({
        topic: this.collabService.roomTopic,
        data: JSON.stringify(msg),
      });

      try {
        return await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingRequests.delete(requestId);
            reject(new Error('timeout'));
          }, timeoutMs);
          this.pendingRequests.set(requestId, { resolve, reject, timeout });
        });
      } catch (e) {
        if (attempt === maxAttempts) {
          console.log(`[Collab:Share] !! All ${maxAttempts} attempts failed for code-request`);
          throw new Error(`Timeout: pas de reponse de '${targetPeer}' apres ${maxAttempts} tentatives`);
        }
        console.log(`[Collab:Share] !! Attempt ${attempt} timed out, retrying...`);
      }
    }
    throw new Error('unreachable');
  }

  /**
   * Request full notebook from a peer (all cell types: code + markdown).
   * Retries up to 3 times (8s per attempt) to handle pubsub mesh delays.
   */
  async requestNotebook(targetPeer: string, notebookPath: string): Promise<SharedCell[]> {
    const maxAttempts = 3;
    const timeoutMs = 8000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ourId = this.collabService.peerId;

      console.log(`[Collab:Share] >> notebook-request (attempt ${attempt}/${maxAttempts}) reqId=${requestId} targetPeer="${targetPeer.slice(0, 16)}..." nb="${notebookPath}"`);

      const msg: CollabMessage = {
        type: 'code-request',
        from: ourId,
        notebookPath,
        data: { requestId, targetPeer, notebookPath, fullNotebook: true },
        timestamp: Date.now(),
      };

      await window.labAPI.ipfs.pubsubPublish({
        topic: this.collabService.roomTopic,
        data: JSON.stringify(msg),
      });

      try {
        return await new Promise<SharedCell[]>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingNotebookRequests.delete(requestId);
            reject(new Error('timeout'));
          }, timeoutMs);
          this.pendingNotebookRequests.set(requestId, { resolve, reject, timeout });
        });
      } catch (e) {
        if (attempt === maxAttempts) {
          console.log(`[Collab:Share] !! All ${maxAttempts} attempts failed for notebook-request`);
          throw new Error(`Timeout: pas de reponse de '${targetPeer}' apres ${maxAttempts} tentatives`);
        }
        console.log(`[Collab:Share] !! Attempt ${attempt} timed out, retrying...`);
      }
    }
    throw new Error('unreachable');
  }

  /**
   * Route incoming collab message to the right handler
   */
  async handleMessage(msg: CollabMessage): Promise<void> {
    switch (msg.type) {
      case 'share-manifest':
        this.handleShareManifest(msg);
        break;
      case 'code-request':
        await this.handleCodeRequest(msg);
        break;
      case 'code-response':
        this.handleCodeResponse(msg);
        break;
    }
  }

  /**
   * Cleanup pending requests
   */
  destroy(): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Service arrete'));
    }
    this.pendingRequests.clear();
    for (const [, pending] of this.pendingNotebookRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Service arrete'));
    }
    this.pendingNotebookRequests.clear();
  }
}
