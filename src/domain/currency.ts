import type { Instrument, Trade } from './types';

/**
 * Convert an amount in the instrument's quote currency into the trade's P&L currency.
 * Only the "quote differs, base is the P&L currency" case converts (divide by `rate`,
 * the quote-per-base price); otherwise the amount is returned unchanged.
 */
export function quoteToPnl(amountInQuote: number, instrument: Instrument, pnlCurrency: string, rate: number): number {
  if (instrument.quoteCurrency !== pnlCurrency && instrument.baseCurrency === pnlCurrency) {
    return amountInQuote / rate;
  }
  return amountInQuote;
}

/** The P&L currency a trade settles in, from instrument and account currency alone. */
export function pnlCurrencyFor(instrument: Instrument, accountCurrency: string): string {
  return instrument.quoteCurrency !== accountCurrency && instrument.baseCurrency === accountCurrency
    ? accountCurrency
    : instrument.quoteCurrency;
}

/** Group trades by pnlCurrency; metrics expect a single-currency set. */
export function partitionByCurrency(trades: readonly Trade[]): Map<string, Trade[]> {
  const out = new Map<string, Trade[]>();
  for (const t of trades) {
    const g = out.get(t.pnlCurrency);
    if (g) g.push(t);
    else out.set(t.pnlCurrency, [t]);
  }
  return out;
}
