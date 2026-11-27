// No 'use client': a plain bar, drawn the same on the server and the client.

/** What a share of the bar means: money kept or won, money lost, or neither. */
export type SplitTone = 'gain' | 'loss' | 'neutral';

export interface SplitSegment {
  tone: SplitTone;
  /** How much of the bar it takes, relative to the others: a count, an amount or a ratio's part. */
  value: number;
}

const FILL: Record<SplitTone, string> = {
  gain: 'bg-gain-fill',
  loss: 'bg-loss-fill',
  neutral: 'bg-line-2',
};

/**
 * A thin bar split into shares (C67): won against lost, green against flat
 * against red days, a profit factor's won against lost. It draws the split
 * and nothing else, so it is hidden from assistive tech: the widget beside it
 * says the same in words (its counts, or its figure). A share that is zero,
 * negative or not a number draws nothing; with no share left the bar is its
 * empty track, which is also how a hidden figure (Privacy) shows no split.
 */
export function SplitBar({
  segments,
  className = '',
}: {
  segments: readonly SplitSegment[];
  className?: string;
}): React.JSX.Element {
  const shares = segments.filter(
    (s) => Number.isFinite(s.value) && s.value > 0,
  );
  return (
    <div
      aria-hidden="true"
      data-split-bar
      className={`flex h-1.5 gap-0.5 ${shares.length === 0 ? 'rounded-[3px] bg-sunken' : ''} ${className}`}
    >
      {shares.map((s, i) => (
        <i
          key={i}
          data-tone={s.tone}
          // A sliver still shows: a share of one in a thousand is a mark, not a gap.
          className={`block h-full min-w-0.5 basis-0 rounded-[2px] ${FILL[s.tone]}`}
          style={{ flexGrow: s.value }}
        />
      ))}
    </div>
  );
}
