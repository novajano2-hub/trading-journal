// No 'use client': server components import this for link-styled buttons.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

/**
 * One `md` for every button in the app, the top bar's Import: 34px, 13.5px at
 * weight 600. On a touch screen both grow to a 44px target. `sm` is the
 * compact one for a button inside a card's row.
 */
export const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'h-[34px] px-[15px] text-[13.5px] font-semibold pointer-coarse:h-11',
  sm: 'h-[30px] px-3 text-[13px] font-medium pointer-coarse:h-11',
};

/**
 * The primary's material (Daylight premium): the accent lit from its top
 * edge, an inner highlight along that edge, and a brand shadow under it; it
 * presses 1px. The gradient can't be eased, so hover swaps it outright for
 * one a step deeper. On a dark ground the shadow goes neutral: a blue one
 * there would read as a glow.
 */
export const RAISED =
  'bg-accent bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent),white_7%),var(--accent))] text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_1px_2px_rgb(31_39_140/0.4),0_6px_14px_-6px_rgb(43_53_175/0.6)] hover:bg-[linear-gradient(180deg,var(--accent),var(--accent-hover))] active:translate-y-px [[data-theme=dark]_&]:shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.5),0_6px_14px_-6px_rgb(0_0_0/0.7)]';

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: RAISED,
  secondary: 'bg-surface-1 text-text border border-line-2 hover:border-faint',
  ghost: 'bg-transparent text-text hover:bg-sunken',
};

/** The Button look, for a link: `<Link className={buttonClasses('secondary')}>`. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
): string {
  return `relative inline-flex ${BUTTON_SIZE[size]} select-none items-center justify-center gap-2 whitespace-nowrap rounded-control transition-colors duration-120 ${BUTTON_VARIANT[variant]}`;
}
