import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

type CellOutput = {
  output_type: string;
  name?: string;
  text?: string | string[];
  data?: Record<string, string | string[]>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
};

function getTextContent(text: string | string[] | undefined): string {
  if (!text) return '';
  return Array.isArray(text) ? text.join('') : text;
}

function RichOutput({ data }: { data: Record<string, string | string[]> }) {
  if (data['text/html']) {
    const html = getTextContent(data['text/html']);
    return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (data['text/markdown']) {
    const md = getTextContent(data['text/markdown']);
    const html = marked.parse(md) as string;
    return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (data['text/latex']) {
    const latex = getTextContent(data['text/latex']);
    return <pre className="cell-output text-slate-300">{latex}</pre>;
  }

  if (data['image/png']) {
    const src = `data:image/png;base64,${getTextContent(data['image/png'])}`;
    return <img src={src} alt="output" className="max-w-full" />;
  }

  if (data['image/jpeg']) {
    const src = `data:image/jpeg;base64,${getTextContent(data['image/jpeg'])}`;
    return <img src={src} alt="output" className="max-w-full" />;
  }

  if (data['image/svg+xml']) {
    const svg = getTextContent(data['image/svg+xml']);
    return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />;
  }

  if (data['text/plain']) {
    return <pre className="cell-output text-slate-300">{getTextContent(data['text/plain'])}</pre>;
  }

  return null;
}

function SingleOutput({ output }: { output: CellOutput }) {
  switch (output.output_type) {
    case 'stream':
      return (
        <pre className={`cell-output ${output.name === 'stderr' ? 'text-red-400' : 'text-slate-400'}`}>
          {getTextContent(output.text)}
        </pre>
      );

    case 'execute_result':
    case 'display_data':
      return output.data ? <RichOutput data={output.data} /> : null;

    case 'error':
      return (
        <div>
          <span className="text-xs font-bold text-red-400">{output.ename}: </span>
          <span className="text-xs text-red-300">{output.evalue}</span>
          {output.traceback && (
            <pre className="cell-output text-red-400/70 mt-1 text-[11px]">
              {output.traceback.join('\n').replace(/\x1b\[[0-9;]*m/g, '')}
            </pre>
          )}
        </div>
      );

    default:
      return null;
  }
}

export function MobileCellOutputView({ outputs }: { outputs: CellOutput[] }) {
  if (outputs.length === 0) return null;

  return (
    <div className="cell-output px-3 py-2 text-sm">
      {outputs.map((output, i) => (
        <SingleOutput key={i} output={output} />
      ))}
    </div>
  );
}
