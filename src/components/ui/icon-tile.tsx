import type { Icon } from '@phosphor-icons/react';

export type TileTone = 'accent' | 'neutral' | 'faint' | 'gain' | 'loss';

const TONE: Record<TileTone, string> = {
  accent: 'bg-accent-soft text-accent-ink',
  neutral: 'bg-sunken text-muted',
  faint: 'bg-sunken text-faint',
  gain: 'bg-gain-soft text-gain',
  loss: 'bg-loss-soft text-loss',
};

/** A 32px tile, 6px radius, holding one 18px duotone glyph. Decorative. */
export function IconTile({
  icon: Glyph,
  tone = 'neutral',
  className = '',
}: {
  icon: Icon;
  tone?: TileTone;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-chip ${TONE[tone]} ${className}`}
    >
      <Glyph size={18} weight="duotone" />
    </span>
  );
}
