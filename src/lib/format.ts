import type { Cents } from '@/domain/types';

function currencyString(cents: Cents, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    Math.abs(cents) / 100,
  );
}

/** Unsigned money, e.g. balances. */
export function formatMoney(cents: Cents, currency = 'USD'): string {
  return currencyString(cents, currency);
}

/** Signed P&L: `+` for gains, U+2212 minus for losses, none for zero. */
export function formatPnl(cents: Cents, currency = 'USD'): string {
  const body = currencyString(cents, currency);
  if (cents > 0) return `+${body}`;
  if (cents < 0) return `−${body}`;
  return body;
}

/** A 0..1 ratio as a percentage with a fixed number of decimals, e.g. 0.5 → "50.0%" at 1. */
export function formatPct(ratio: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(ratio);
}

/**
 * Rule adherence, a 0..1 ratio, as a whole percentage that never claims an
 * edge it hasn't reached: 199 of 200 reads 99.5%, not 100%, and 1 of 300
 * reads 0.3%, not 0%. Near either edge it shows one decimal, kept between
 * 0.1% and 99.9%.
 */
export function formatAdherence(ratio: number): string {
  if (adherenceDigits(ratio) === 0) return formatPct(ratio, 0);
  const tenths = Math.min(999, Math.max(1, Math.round(ratio * 1000)));
  return formatPct(tenths / 1000, 1);
}

/** The decimals `formatAdherence` shows: 1 where a whole percentage would read 0% or 100% short of it, else 0. */
export function adherenceDigits(ratio: number): 0 | 1 {
  if (ratio <= 0 || ratio >= 1) return 0;
  const whole = formatPct(ratio, 0);
  return whole === formatPct(0, 0) || whole === formatPct(1, 0) ? 1 : 0;
}

/** A plain ratio such as profit factor, to two decimals. */
export function formatRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

/** Signed whole dollars for chart labels, e.g. +1,160 or −39. Zero is bare. */
export function formatPnlWhole(cents: Cents): string {
  const body = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(Math.abs(cents) / 100));
  if (cents > 0) return `+${body}`;
  if (cents < 0) return `−${body}`;
  return body;
}
