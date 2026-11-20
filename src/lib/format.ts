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
