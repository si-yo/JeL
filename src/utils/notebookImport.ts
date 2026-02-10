import { parseNotebook } from './notebook';
import { validateReceivedCode, wrapUnsafeCode } from './codeSandbox';
import type { CodeShareService } from '../services/codeShareService';

/**
 * Resolves %use directives in cell source code.
 *
 * Syntax:
 *   %use utils.ipynb           → execute all code cells from utils.ipynb
 *   %use utils.ipynb:3         → execute only cell at index 3
 *   %use utils.ipynb:my_func   → execute cells containing "def my_func"
 *
 * Multiple %use lines are supported per cell.
 * Paths are resolved relative to the current notebook's directory,
 * or the project root if available.
 *
 * The directive line is replaced with the extracted code + a comment header.
 */

const USE_REGEX = /^%use\s+(.+)$/gm;

interface ResolveContext {
  /** Absolute path of the current notebook (if saved) */
  currentNotebookPath: string | null;
  /** Absolute path of the project root (if in a project) */
  projectPath: string | null;
}

/**
 * Resolve all %use directives in source code.
 * Returns the expanded source code ready for kernel execution.
 */
export async function resolveUse(
  source: string,
  ctx: ResolveContext
): Promise<string> {
  const matches: { fullMatch: string; target: string; selector?: string }[] = [];

  let match;
  while ((match = USE_REGEX.exec(source)) !== null) {
    const raw = match[1].trim();
    // Parse "notebook.ipynb:selector" or just "notebook.ipynb"
    const colonIdx = raw.lastIndexOf(':');
    let target: string;
    let selector: string | undefined;

    if (colonIdx > 0 && !raw.substring(colonIdx).includes('/')) {
      target = raw.substring(0, colonIdx).trim();
      selector = raw.substring(colonIdx + 1).trim();
    } else {
      target = raw;
    }

    matches.push({ fullMatch: match[0], target, selector });
  }

  if (matches.length === 0) return source;

  let result = source;

  for (const { fullMatch, target, selector } of matches) {
    const code = await loadNotebookCode(target, selector, ctx);
    if (code !== null) {
      const header = `# --- %use ${target}${selector ? ':' + selector : ''} ---`;
      const footer = `# --- fin %use ---`;
      result = result.replace(fullMatch, `${header}\n${code}\n${footer}`);
    } else {
      result = result.replace(
        fullMatch,
        `raise ImportError("Lab: impossible de charger '${target}'")`
      );
    }
  }

  return result;
}

/**
 * Check if source contains any %use directives
 */
export function hasUse(source: string): boolean {
  return /^%use\s+/m.test(source);
}

async function loadNotebookCode(
  target: string,
  selector: string | undefined,
  ctx: ResolveContext
): Promise<string | null> {
  const filePath = resolveNotebookPath(target, ctx);
  if (!filePath) return null;

  const fileResult = await window.labAPI.fs.readFile(filePath);
  if (!fileResult.success || !fileResult.data) return null;

  let nb;
  try {
    nb = parseNotebook(fileResult.data);
  } catch {
    return null;
  }

  const codeCells = nb.cells.filter((c) => c.cell_type === 'code' && c.source.trim());

  if (!selector) {
    // All code cells
    return codeCells.map((c) => c.source).join('\n\n');
  }

  // Numeric selector → cell index
  const idx = parseInt(selector, 10);
  if (!isNaN(idx)) {
    const cell = codeCells[idx];
    return cell ? cell.source : null;
  }

  // String selector → find cells containing "def <selector>" or "class <selector>"
  const pattern = new RegExp(`(?:def|class)\\s+${escapeRegex(selector)}\\b`);
  const matched = codeCells.filter((c) => pattern.test(c.source));
  if (matched.length === 0) return null;
  return matched.map((c) => c.source).join('\n\n');
}

function resolveNotebookPath(target: string, ctx: ResolveContext): string | null {
  // If target is already absolute
  if (target.startsWith('/')) return target;

  // Resolve relative to current notebook directory
  if (ctx.currentNotebookPath) {
    const dir = ctx.currentNotebookPath.substring(
      0,
      ctx.currentNotebookPath.lastIndexOf('/')
    );
    return `${dir}/${target}`;
  }

  // Resolve relative to project root
  if (ctx.projectPath) {
    return `${ctx.projectPath}/${target}`;
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===========================================
// %ask - Remote code sharing
// ===========================================

const ASK_REGEX = /^%ask\s+(\S+)\s+(.+)$/gm;
const ASK_FORCE_REGEX = /^%ask\s+--force\s+(\S+)\s+(.+)$/gm;

/**
 * Check if source contains any %ask directives
 */
export function hasAsk(source: string): boolean {
  return /^%ask\s+/m.test(source);
}

/**
 * Resolve all %ask directives in source code.
 * Requests code from peers via codeShareService and validates with codeSandbox.
 */
export async function resolveAsk(
  source: string,
  codeShareService: CodeShareService
): Promise<string> {
  // First check for --force variants
  const forceMatches: { fullMatch: string; peer: string; target: string; selector?: string; force: boolean }[] = [];

  let match;
  // Reset regex state
  ASK_FORCE_REGEX.lastIndex = 0;
  while ((match = ASK_FORCE_REGEX.exec(source)) !== null) {
    const peer = match[1];
    const raw = match[2].trim();
    const colonIdx = raw.lastIndexOf(':');
    let target: string;
    let selector: string | undefined;

    if (colonIdx > 0 && !raw.substring(colonIdx).includes('/')) {
      target = raw.substring(0, colonIdx).trim();
      selector = raw.substring(colonIdx + 1).trim();
    } else {
      target = raw;
    }

    forceMatches.push({ fullMatch: match[0], peer, target, selector, force: true });
  }

  // Then normal %ask
  ASK_REGEX.lastIndex = 0;
  const normalMatches: typeof forceMatches = [];
  while ((match = ASK_REGEX.exec(source)) !== null) {
    // Skip if this line was already matched as --force
    if (match[1] === '--force') continue;

    const peer = match[1];
    const raw = match[2].trim();
    const colonIdx = raw.lastIndexOf(':');
    let target: string;
    let selector: string | undefined;

    if (colonIdx > 0 && !raw.substring(colonIdx).includes('/')) {
      target = raw.substring(0, colonIdx).trim();
      selector = raw.substring(colonIdx + 1).trim();
    } else {
      target = raw;
    }

    normalMatches.push({ fullMatch: match[0], peer, target, selector, force: false });
  }

  const allMatches = [...forceMatches, ...normalMatches];
  if (allMatches.length === 0) return source;

  let result = source;

  for (const { fullMatch, peer, target, selector, force } of allMatches) {
    try {
      const code = await codeShareService.requestCode(peer, target, selector);

      // Validate received code
      const validation = validateReceivedCode(code);

      if (!validation.safe && !force) {
        const wrapped = wrapUnsafeCode(code, validation.warnings);
        result = result.replace(fullMatch, wrapped);
      } else {
        const header = `# --- %ask ${peer} ${target}${selector ? ':' + selector : ''} ---`;
        const footer = `# --- fin %ask ---`;
        const safetyNote = !validation.safe ? '# ⚠ FORCE: code non valide par le sandbox\n' : '';
        result = result.replace(fullMatch, `${header}\n${safetyNote}${code}\n${footer}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      result = result.replace(
        fullMatch,
        `raise ConnectionError("Lab %ask: ${errorMsg.replace(/"/g, '\\"')}")`
      );
    }
  }

  return result;
}
