/**
 * PDF Export Service
 * Generates print-ready HTML for Electron's printToPDF
 */

import { marked } from 'marked';
import type { OpenNotebook, Cell, CellOutput } from '../types';

marked.setOptions({ breaks: true, gfm: true });

export type ExportScope = 'single' | 'linked' | 'project';

export interface ExportOptions {
  scope: ExportScope;
  notebookId: string;
  notebooks: OpenNotebook[];
  hiddenCellIds?: Set<string>;
}

function getTextContent(text: string | string[] | undefined): string {
  if (!text) return '';
  return Array.isArray(text) ? text.join('') : text;
}

function renderOutputHtml(output: CellOutput): string {
  switch (output.output_type) {
    case 'stream': {
      const text = getTextContent(output.text);
      if (!text) return '';
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<pre class="stream">${escaped}</pre>`;
    }

    case 'execute_result':
    case 'display_data': {
      if (!output.data) return '';
      return renderRichData(output.data);
    }

    case 'error':
      // Skip errors in PDF export
      return '';

    default:
      return '';
  }
}

function renderRichData(data: Record<string, string | string[]>): string {
  // Priority: HTML > Markdown > LaTeX > PNG > JPEG > SVG > text/plain
  if (data['text/html']) {
    let html = getTextContent(data['text/html']);
    // Replace <video> tags with placeholder (animations can't render in PDF)
    html = html.replace(/<video[^>]*>[\s\S]*?<\/video>/gi, '<p class="placeholder">[Animation]</p>');
    return `<div class="html-output">${html}</div>`;
  }

  if (data['text/markdown']) {
    const md = getTextContent(data['text/markdown']);
    const html = marked.parse(md) as string;
    return `<div class="markdown-output">${html}</div>`;
  }

  if (data['text/latex']) {
    const latex = getTextContent(data['text/latex']);
    const escaped = latex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre class="latex">${escaped}</pre>`;
  }

  if (data['image/png']) {
    const src = `data:image/png;base64,${getTextContent(data['image/png'])}`;
    return `<img src="${src}" alt="output" />`;
  }

  if (data['image/jpeg']) {
    const src = `data:image/jpeg;base64,${getTextContent(data['image/jpeg'])}`;
    return `<img src="${src}" alt="output" />`;
  }

  if (data['image/gif']) {
    const src = `data:image/gif;base64,${getTextContent(data['image/gif'])}`;
    return `<img src="${src}" alt="output" />`;
  }

  if (data['image/svg+xml']) {
    const svg = getTextContent(data['image/svg+xml']);
    return `<div class="svg-output">${svg}</div>`;
  }

  if (data['text/plain']) {
    const text = getTextContent(data['text/plain']);
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre class="text-output">${escaped}</pre>`;
  }

  return '';
}

function renderCellHtml(cell: Cell, hiddenCellIds?: Set<string>): string {
  if (hiddenCellIds?.has(cell.id)) return '';

  if (cell.cell_type === 'markdown') {
    if (!cell.source.trim()) return '';
    const html = marked.parse(cell.source) as string;
    return `<div class="cell markdown-cell">${html}</div>`;
  }

  // Code cell: only render outputs, skip source
  if (cell.outputs.length === 0) return '';

  const outputsHtml = cell.outputs
    .map(renderOutputHtml)
    .filter(Boolean)
    .join('\n');

  if (!outputsHtml) return '';
  return `<div class="cell code-cell-output">${outputsHtml}</div>`;
}

function renderNotebookHtml(notebook: OpenNotebook, hiddenCellIds?: Set<string>): string {
  const cellsHtml = notebook.data.cells
    .map((cell) => renderCellHtml(cell, hiddenCellIds))
    .filter(Boolean)
    .join('\n');

  return cellsHtml;
}

/** Extract .ipynb links from markdown cells */
function extractLinkedNotebooks(notebook: OpenNotebook): string[] {
  const links: string[] = [];
  const regex = /\[.*?\]\((.*?\.ipynb)\)/g;

  for (const cell of notebook.data.cells) {
    if (cell.cell_type !== 'markdown') continue;
    let match;
    while ((match = regex.exec(cell.source)) !== null) {
      const link = match[1];
      if (!links.includes(link)) {
        links.push(link);
      }
    }
  }
  return links;
}

/** Process markdown links: replace .ipynb links with internal anchors if included */
function processLinks(html: string, includedNames: Set<string>): string {
  // Replace .ipynb links with anchors if the target is included
  return html.replace(
    /href="([^"]*?\.ipynb)"/g,
    (_match, link: string) => {
      const name = link.split('/').pop()?.replace('.ipynb', '') || '';
      if (includedNames.has(name)) {
        return `href="#notebook-${name}"`;
      }
      return `href="#" title="${link}"`;
    }
  );
}

export function generatePdfHtml(options: ExportOptions): string {
  const { scope, notebookId, notebooks, hiddenCellIds } = options;

  const activeNotebook = notebooks.find((n) => n.id === notebookId);
  if (!activeNotebook) return '';

  let notebooksToExport: OpenNotebook[] = [];
  const includedNames = new Set<string>();

  if (scope === 'single') {
    notebooksToExport = [activeNotebook];
  } else if (scope === 'linked') {
    notebooksToExport = [activeNotebook];
    const linkedPaths = extractLinkedNotebooks(activeNotebook);

    for (const linkPath of linkedPaths) {
      const fileName = linkPath.split('/').pop() || '';
      const linked = notebooks.find(
        (n) => n.fileName === fileName || n.filePath?.endsWith(linkPath)
      );
      if (linked && linked.id !== notebookId) {
        notebooksToExport.push(linked);
      }
    }
  } else {
    // project: all open notebooks
    notebooksToExport = [...notebooks];
  }

  // Build set of included names for link resolution
  for (const nb of notebooksToExport) {
    const name = nb.fileName.replace('.ipynb', '');
    includedNames.add(name);
  }

  // Generate body
  const sections: string[] = [];

  if (scope === 'project' && notebooksToExport.length > 1) {
    // Table of contents
    const tocEntries = notebooksToExport
      .map((nb) => {
        const name = nb.fileName.replace('.ipynb', '');
        return `<li><a href="#notebook-${name}">${nb.fileName}</a></li>`;
      })
      .join('\n');
    sections.push(`<div class="toc"><h2>Table des matieres</h2><ul>${tocEntries}</ul></div>`);
  }

  notebooksToExport.forEach((nb, idx) => {
    const name = nb.fileName.replace('.ipynb', '');
    const pageBreak = idx > 0 ? ' page-break' : '';
    const title = `<div class="notebook-title${pageBreak}" id="notebook-${name}">${nb.fileName}</div>`;
    let content = renderNotebookHtml(nb, nb.id === notebookId ? hiddenCellIds : undefined);
    content = processLinks(content, includedNames);
    sections.push(title + '\n' + content);
  });

  const body = sections.join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 20px 30px;
    color: #1a1a1a;
    font-size: 14px;
    line-height: 1.6;
  }
  h1 { font-size: 28px; margin-top: 1.5em; margin-bottom: 0.5em; }
  h2 { font-size: 22px; margin-top: 1.3em; margin-bottom: 0.4em; }
  h3 { font-size: 18px; margin-top: 1.2em; margin-bottom: 0.3em; }
  h4, h5, h6 { margin-top: 1em; margin-bottom: 0.3em; }
  p { margin: 0.5em 0; }
  pre {
    background: #f4f4f5;
    padding: 10px 14px;
    border-radius: 6px;
    overflow-x: auto;
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
    line-height: 1.5;
    margin: 6px 0;
  }
  code {
    background: #f4f4f5;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 12px;
    font-family: 'SF Mono', 'Fira Code', 'Menlo', monospace;
  }
  pre code { background: none; padding: 0; }
  img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 8px 0;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 8px 0;
    font-size: 13px;
  }
  td, th {
    border: 1px solid #d4d4d8;
    padding: 6px 10px;
    text-align: left;
  }
  th { background: #f4f4f5; font-weight: 600; }
  a { color: #2563eb; text-decoration: underline; }
  .notebook-title {
    font-size: 24px;
    font-weight: 700;
    border-bottom: 2px solid #27272a;
    padding-bottom: 8px;
    margin-bottom: 20px;
    margin-top: 10px;
  }
  .page-break { page-break-before: always; }
  .cell { margin-bottom: 12px; }
  .stream { color: #27272a; }
  .html-output { overflow-x: auto; }
  .svg-output { overflow-x: auto; }
  .svg-output svg { max-width: 100%; height: auto; }
  .placeholder { color: #71717a; font-style: italic; }
  .toc { margin-bottom: 30px; }
  .toc h2 { font-size: 20px; }
  .toc ul { list-style: none; padding-left: 0; }
  .toc li { margin: 4px 0; }
  .toc a { color: #2563eb; text-decoration: none; }
  .toc a:hover { text-decoration: underline; }
  blockquote {
    border-left: 3px solid #d4d4d8;
    margin: 8px 0;
    padding: 4px 16px;
    color: #52525b;
  }
  hr { border: none; border-top: 1px solid #d4d4d8; margin: 16px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
