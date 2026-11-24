export interface PathBox {
  /** Right edge of the line in viewBox units. */
  xMax: number;
  /** Highest and lowest y the line may reach. */
  top: number;
  bottom: number;
  /** y of the baseline the area fill closes to. */
  floor: number;
  /** The values the box spans, when several lines share one scale; default: this series' own extent. */
  range?: { min: number; max: number };
}

export interface Point {
  x: number;
  y: number;
}

const r = (n: number) => Math.round(n * 100) / 100;

/** SVG paths for an equity series: higher equity is higher on screen. */
export function equityPath(
  series: readonly number[],
  box: PathBox,
): { line: string; area: string; first: Point | null; last: Point | null } {
  if (series.length === 0)
    return { line: '', area: '', first: null, last: null };
  const min = box.range
    ? Math.min(box.range.min, ...series)
    : Math.min(...series);
  const max = box.range
    ? Math.max(box.range.max, ...series)
    : Math.max(...series);
  const span = max - min;
  const pts: Point[] = series.map((v, i) => ({
    x: r(series.length === 1 ? 0 : (i / (series.length - 1)) * box.xMax),
    y: r(
      span === 0
        ? (box.top + box.bottom) / 2
        : box.bottom - ((v - min) / span) * (box.bottom - box.top),
    ),
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`)
    .join(' ');
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return {
    line,
    area: `${line} L${last.x} ${box.floor} L${first.x} ${box.floor}Z`,
    first,
    last,
  };
}
