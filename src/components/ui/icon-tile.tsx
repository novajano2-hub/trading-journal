import type { Icon } from '@phosphor-icons/react';

export type TileTone =
  | 'accent'
  | 'neutral'
  | 'faint'
  | 'warn'
  | 'info'
  | 'gain'
  | 'loss'
  /** On the ultramarine hero card: a translucent white tile. */
  | 'on-accent';

/**
 * The glyph's ink. Its duotone layer (the `[opacity]` path) is the same ink
 * at 20%, Phosphor's own, so each tile reads as one hue in two strengths.
 */
const GLYPH: Record<TileTone, string> = {
  accent: 'text-accent-ink',
  neutral: 'text-text',
  // Outline only: a module that isn't live has nothing to fill.
  faint: 'text-faint [&_[opacity]]:opacity-0',
  warn: 'text-warn',
  info: 'text-info',
  gain: 'text-gain',
  loss: 'text-loss',
  'on-accent': 'text-white',
};

const FILL: Record<TileTone, string> = {
  accent: 'bg-accent-soft',
  neutral: 'bg-sunken',
  faint: 'bg-sunken',
  warn: 'bg-warn-soft',
  info: 'bg-info-soft',
  gain: 'bg-gain-soft',
  loss: 'bg-loss-soft',
  'on-accent': 'bg-white/14 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]',
};

/**
 * A 28px tile, 8px radius, holding one 17px duotone glyph. Decorative.
 * `bare` drops the tile's own fill, for a row that fills it on hover.
 */
export function IconTile({
  icon: Glyph,
  tone = 'neutral',
  bare = false,
  className = '',
}: {
  icon: Icon;
  tone?: TileTone;
  bare?: boolean;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-200 ease-(--ease-glide) ${bare ? '' : FILL[tone]} ${GLYPH[tone]} ${className}`}
    >
      <Glyph size={17} weight="duotone" />
    </span>
  );
}
