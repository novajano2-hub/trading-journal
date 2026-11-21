// No 'use client': server components use these on links.
import { RAISED } from '@/components/ui/button-styles';

/**
 * The site's link-buttons in the app's material: the primary is the app's
 * raised ultramarine button (`RAISED`), the secondary its white control with
 * a brand-tinted lift. Each call site adds a size: height, padding and type.
 */
const BASE =
  'inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap no-underline transition-[border-color,box-shadow,translate] duration-200 ease-(--ease-glide)';

export const CTA_PRIMARY = `${BASE} ${RAISED}`;

export const CTA_SECONDARY = `${BASE} border border-line-2 bg-surface-1 text-text shadow-[var(--shadow-chip)] hover:border-accent/40 active:translate-y-px`;

/** Sizes, from the type ramp: 44px for page actions, 50px for the closing, 38px in the header. */
export const CTA_MD = 'h-11 px-[18px] text-[15px]';
export const CTA_LG = 'h-[50px] px-6 text-base';
export const CTA_SM = 'h-[38px] px-4 text-sm';
