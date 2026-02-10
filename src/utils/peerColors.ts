/**
 * Deterministic color assignment for peers.
 * Each peerId maps to a stable color from a curated palette.
 */

const PEER_COLORS = [
  { name: 'violet', bg: 'rgba(139,92,246,0.15)', border: 'rgb(139,92,246)', text: 'rgb(196,167,255)', dot: 'rgb(167,139,250)' },
  { name: 'cyan', bg: 'rgba(6,182,212,0.15)', border: 'rgb(6,182,212)', text: 'rgb(165,230,246)', dot: 'rgb(34,211,238)' },
  { name: 'amber', bg: 'rgba(245,158,11,0.15)', border: 'rgb(245,158,11)', text: 'rgb(253,220,164)', dot: 'rgb(251,191,36)' },
  { name: 'rose', bg: 'rgba(244,63,94,0.15)', border: 'rgb(244,63,94)', text: 'rgb(253,164,175)', dot: 'rgb(251,113,133)' },
  { name: 'emerald', bg: 'rgba(16,185,129,0.15)', border: 'rgb(16,185,129)', text: 'rgb(167,243,208)', dot: 'rgb(52,211,153)' },
  { name: 'blue', bg: 'rgba(59,130,246,0.15)', border: 'rgb(59,130,246)', text: 'rgb(147,197,253)', dot: 'rgb(96,165,250)' },
  { name: 'orange', bg: 'rgba(249,115,22,0.15)', border: 'rgb(249,115,22)', text: 'rgb(253,186,116)', dot: 'rgb(251,146,60)' },
  { name: 'pink', bg: 'rgba(236,72,153,0.15)', border: 'rgb(236,72,153)', text: 'rgb(249,168,212)', dot: 'rgb(244,114,182)' },
] as const;

export type PeerColor = (typeof PEER_COLORS)[number];

const peerColorCache = new Map<string, PeerColor>();

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getPeerColor(peerId: string): PeerColor {
  const cached = peerColorCache.get(peerId);
  if (cached) return cached;
  const color = PEER_COLORS[hashString(peerId) % PEER_COLORS.length];
  peerColorCache.set(peerId, color);
  return color;
}
