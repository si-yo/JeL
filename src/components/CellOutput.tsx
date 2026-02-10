import type { CellOutput as CellOutputType } from '../types';
import { cn } from '../utils/cn';

function getTextContent(text: string | string[] | undefined): string {
  if (!text) return '';
  return Array.isArray(text) ? text.join('') : text;
}

function RichOutput({ data }: { data: Record<string, string | string[]> }) {
  // Priority: HTML > image > text
  if (data['text/html']) {
    const html = getTextContent(data['text/html']);
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }

  if (data['image/png']) {
    const src = `data:image/png;base64,${getTextContent(data['image/png'])}`;
    return <img src={src} alt="output" />;
  }

  if (data['image/svg+xml']) {
    const svg = getTextContent(data['image/svg+xml']);
    return <div dangerouslySetInnerHTML={{ __html: svg }} />;
  }

  if (data['text/plain']) {
    return <pre>{getTextContent(data['text/plain'])}</pre>;
  }

  return null;
}

function SingleOutput({ output }: { output: CellOutputType }) {
  switch (output.output_type) {
    case 'stream':
      return (
        <pre className={cn(output.name === 'stderr' ? 'text-red-400' : 'text-slate-300')}>
          {getTextContent(output.text)}
        </pre>
      );

    case 'execute_result':
    case 'display_data':
      return output.data ? <RichOutput data={output.data} /> : null;

    case 'error':
      return (
        <div className="text-red-400">
          <pre className="font-bold">{output.ename}: {output.evalue}</pre>
          {output.traceback?.map((line, i) => (
            <pre
              key={i}
              dangerouslySetInnerHTML={{
                __html: line
                  .replace(/\x1b\[([0-9;]*)m/g, '')
              }}
            />
          ))}
        </div>
      );

    default:
      return null;
  }
}

export function CellOutputView({ outputs }: { outputs: CellOutputType[] }) {
  if (outputs.length === 0) return null;

  return (
    <div className="cell-output px-4 py-2 border-t border-slate-700/50 bg-slate-900/30 text-sm">
      {outputs.map((output, i) => (
        <SingleOutput key={i} output={output} />
      ))}
    </div>
  );
}
