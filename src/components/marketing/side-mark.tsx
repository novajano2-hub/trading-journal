const SIDE = {
  buy: { letter: 'B', word: 'Buy', ink: 'text-buy' },
  sell: { letter: 'S', word: 'Sell', ink: 'text-sell' },
} as const;

/**
 * Buy and sell are always a letter in a circle, never colour alone.
 * An unknown side keeps the circle, dashed, with a dash for the letter.
 */
export function SideMark({
  side,
  size = 'md',
  className = '',
}: {
  side: 'buy' | 'sell' | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const box =
    size === 'sm'
      ? 'size-8 border-2 text-[22px]'
      : 'size-9 border-[2.5px] text-[26px] md:size-[42px] md:text-[30px]';
  const mark = side ? SIDE[side] : null;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display leading-none font-black ${box} ${mark ? `${mark.ink} border-current` : 'border-dashed border-ink/45 text-ink/70'} ${className}`}
    >
      <span aria-hidden="true" className="translate-y-[0.04em]">
        {mark ? mark.letter : '—'}
      </span>
      <span className="sr-only">{mark ? mark.word : 'Side not found'}</span>
    </span>
  );
}
