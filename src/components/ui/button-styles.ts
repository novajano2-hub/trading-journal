// No 'use client': server components import this for link-styled buttons.
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'h-11',
  sm: 'h-[38px]',
};

export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-surface-1 text-text border border-line-2 hover:border-faint',
  ghost: 'bg-transparent text-text hover:bg-sunken',
};

/** The Button look, for a link: `<Link className={buttonClasses('secondary')}>`. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
): string {
  return `relative inline-flex ${BUTTON_SIZE[size]} select-none items-center justify-center gap-2 whitespace-nowrap rounded-control px-[18px] text-[15px] font-medium transition-colors duration-120 ${BUTTON_VARIANT[variant]}`;
}
