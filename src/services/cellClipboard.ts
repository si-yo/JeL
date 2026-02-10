/**
 * Cell Clipboard — module-level clipboard for cell copy/paste.
 * Persists across notebook switches within the same window.
 * Not in Zustand because it doesn't drive UI rendering.
 */
import type { CellOutput } from '../types';

export interface ClipboardCell {
  cell_type: 'code' | 'markdown';
  source: string;
  outputs: CellOutput[];
  metadata: Record<string, unknown>;
}

let _clipboard: ClipboardCell[] = [];

export function setCellClipboard(cells: ClipboardCell[]): void {
  _clipboard = cells;
}

export function getCellClipboard(): ClipboardCell[] {
  return _clipboard;
}

export function hasCellClipboard(): boolean {
  return _clipboard.length > 0;
}
