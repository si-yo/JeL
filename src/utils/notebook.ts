import { v4 as uuidv4 } from 'uuid';
import type { NotebookData, Cell } from '../types';

/**
 * Parse raw .ipynb JSON into our NotebookData format
 */
export function parseNotebook(raw: string): NotebookData {
  const nb = JSON.parse(raw);

  const cells: Cell[] = (nb.cells || []).map((c: Record<string, unknown>) => ({
    id: (c.id as string) || uuidv4(),
    cell_type: (c.cell_type as string) || 'code',
    source: Array.isArray(c.source) ? (c.source as string[]).join('') : (c.source as string) || '',
    outputs: Array.isArray(c.outputs) ? c.outputs : [],
    execution_count: (c.execution_count as number | null) ?? null,
    metadata: (c.metadata as Record<string, unknown>) || {},
  }));

  return {
    cells,
    metadata: nb.metadata || {},
    nbformat: nb.nbformat || 4,
    nbformat_minor: nb.nbformat_minor || 5,
  };
}

/**
 * Serialize NotebookData to .ipynb JSON string
 */
export function serializeNotebook(nb: NotebookData): string {
  const ipynb = {
    cells: nb.cells.map((cell) => ({
      id: cell.id,
      cell_type: cell.cell_type,
      source: cell.source.split('\n').map((line, i, arr) =>
        i < arr.length - 1 ? line + '\n' : line
      ),
      metadata: cell.metadata,
      outputs: cell.cell_type === 'code' ? cell.outputs : undefined,
      execution_count: cell.cell_type === 'code' ? cell.execution_count : undefined,
    })),
    metadata: nb.metadata,
    nbformat: nb.nbformat,
    nbformat_minor: nb.nbformat_minor,
  };

  return JSON.stringify(ipynb, null, 1) + '\n';
}

/**
 * Create an empty notebook
 */
export function createEmptyNotebook(): NotebookData {
  return {
    cells: [createCell('code')],
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        name: 'python',
        version: '3.x',
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

/**
 * Create a new cell
 */
export function createCell(type: 'code' | 'markdown', source = ''): Cell {
  return {
    id: uuidv4(),
    cell_type: type,
    source,
    outputs: [],
    execution_count: null,
    metadata: {},
  };
}
