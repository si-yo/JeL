import { useStore } from '../store/useStore';
import { Link2 } from 'lucide-react';
import type { NotebookLink } from '../types';

/**
 * Extracts [[notebook.ipynb]] or [[notebook.ipynb#cellId]] links from cell sources
 */
export function extractLinks(source: string): NotebookLink[] {
  const regex = /\[\[([^\]#]+?)(?:#([^\]]+?))?\]\]/g;
  const links: NotebookLink[] = [];
  let match;
  while ((match = regex.exec(source)) !== null) {
    links.push({
      targetNotebook: match[1],
      targetCellId: match[2] || undefined,
      label: match[0],
    });
  }
  return links;
}

/**
 * Get all links from the active notebook
 */
export function useNotebookLinks(): NotebookLink[] {
  const notebook = useStore((s) => s.getActiveNotebook());
  if (!notebook) return [];

  const allLinks: NotebookLink[] = [];
  for (const cell of notebook.data.cells) {
    if (cell.cell_type === 'markdown') {
      allLinks.push(...extractLinks(cell.source));
    }
  }
  return allLinks;
}

interface NotebookLinksProps {
  onNavigate: (link: NotebookLink) => void;
}

export function NotebookLinks({ onNavigate }: NotebookLinksProps) {
  const links = useNotebookLinks();

  if (links.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-slate-700/30">
      <div className="flex items-center gap-1 text-[10px] text-slate-500 uppercase tracking-wider mb-1">
        <Link2 className="w-3 h-3" />
        Liens
      </div>
      <div className="flex flex-wrap gap-1">
        {links.map((link, i) => (
          <button
            key={i}
            onClick={() => onNavigate(link)}
            className="px-2 py-0.5 rounded text-[11px] bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            title={`Ouvrir ${link.targetNotebook}${link.targetCellId ? '#' + link.targetCellId : ''}`}
          >
            {link.targetNotebook}
          </button>
        ))}
      </div>
    </div>
  );
}
