import { useStore, type RemoteCursor } from '../store/useStore';
import { getPeerColor } from '../utils/peerColors';

interface Props {
  notebookPath: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function RemoteCursors({ notebookPath, scrollRef }: Props) {
  const remoteCursors = useStore((s) => s.remoteCursors);

  const cursors = Object.values(remoteCursors).filter(
    (rc) => rc.notebookPath === notebookPath && rc.visible && rc.x != null && rc.y != null
  );

  if (cursors.length === 0 || !scrollRef.current) return null;

  const scrollTop = scrollRef.current.scrollTop;
  const scrollLeft = scrollRef.current.scrollLeft;

  return (
    <>
      {cursors.map((cursor) => {
        const color = getPeerColor(cursor.peerId);
        const displayX = (cursor.x ?? 0) - scrollLeft;
        const displayY = (cursor.y ?? 0) - scrollTop;
        const name = cursor.peerName || cursor.peerId.slice(0, 8);

        return (
          <div
            key={cursor.peerId}
            className="pointer-events-none absolute z-50 transition-all duration-150 ease-out"
            style={{ left: displayX, top: displayY }}
          >
            {/* Cross cursor */}
            <svg width="20" height="20" viewBox="0 0 20 20" className="absolute -left-[10px] -top-[10px]">
              <line x1="10" y1="2" x2="10" y2="18" stroke={color.border} strokeWidth="2" strokeLinecap="round" />
              <line x1="2" y1="10" x2="18" y2="10" stroke={color.border} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {/* Pseudo label */}
            <div
              className="absolute left-3 top-3 whitespace-nowrap px-1.5 py-0.5 rounded text-[10px] font-medium shadow-lg"
              style={{
                backgroundColor: color.border,
                color: '#fff',
              }}
            >
              {name}
            </div>
          </div>
        );
      })}
    </>
  );
}
