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
 * Duotone's second layer is the glyph's `[opacity]` path: this tints it
 * cobalt. Dark grounds swallow a quarter-strength tint, so it doubles there.
 */
const COBALT_FILL =
  '[&_[opacity]]:fill-accent [&_[opacity]]:opacity-25 [[data-theme=dark]_&_[opacity]]:opacity-45';

const GLYPH: Record<TileTone, string> = {
  accent: `text-accent-ink ${COBALT_FILL}`,
  neutral: `text-muted ${COBALT_FILL}`,
  // Outline only: a module that isn't live has nothing to fill.
  faint: 'text-faint [&_[opacity]]:opacity-0',
  warn: 'text-warn [&_[opacity]]:fill-warn-fill [&_[opacity]]:opacity-35',
  info: 'text-info [&_[opacity]]:fill-info-fill [&_[opacity]]:opacity-35',
  gain: 'text-gain [&_[opacity]]:fill-gain-fill [&_[opacity]]:opacity-35',
  loss: 'text-loss [&_[opacity]]:fill-loss-fill [&_[opacity]]:opacity-35',
  'on-accent': 'text-white [&_[opacity]]:fill-white [&_[opacity]]:opacity-30',
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
 * A 32px tile, 6px radius, holding one 18px duotone glyph. Decorative.
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
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-chip transition-colors duration-120 ${bare ? '' : FILL[tone]} ${GLYPH[tone]} ${className}`}
    >
      <Glyph size={18} weight="duotone" />
    </span>
  );
}
