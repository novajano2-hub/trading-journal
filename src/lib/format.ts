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
