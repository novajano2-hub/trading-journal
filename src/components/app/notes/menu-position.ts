// Where a menu that opens at the caret goes: under it, or over it when the
// screen below is too short, and never off an edge. `room` is how tall the
// list may be there.
import type { CSSProperties } from 'react';

export function placeMenu(
  rect: DOMRect | null,
  width: number,
  wanted: number,
): { style: CSSProperties; room: number } {
  const w = globalThis.innerWidth ?? 400;
  const h = globalThis.innerHeight ?? 800;
  if (!rect)
    return { style: { position: 'fixed', left: 8, top: 120 }, room: wanted };
  const left = Math.max(8, Math.min(rect.left, w - width - 8));
  const below = h - rect.bottom - 14;
  const above = rect.top - 14;
  if (below >= Math.min(wanted, 260) || below >= above)
    return {
      style: { position: 'fixed', left, top: rect.bottom + 6 },
      room: Math.min(wanted, Math.max(120, below)),
    };
  return {
    style: { position: 'fixed', left, bottom: h - rect.top + 6 },
    room: Math.min(wanted, Math.max(120, above)),
  };
}
