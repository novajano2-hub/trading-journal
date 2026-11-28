import { TZDate } from '@date-fns/tz';
import { canonicalSymbol } from '@/domain/trade-builder';
import type { Execution, Instrument } from '@/domain/types';

/** The id of the synthetic fill that closes an expired option ends with this. */
const SETTLEMENT = ':expiry';

/** Whether the execution is the synthetic fill that settled an expired option, not one a broker made. */
export const isExpirySettlement = (e: Pick<Execution, 'id'>): boolean =>
  e.id.endsWith(SETTLEMENT);

export interface ExpiredOption {
  accountId: string;
  symbol: string; // canonical
  expiry: string; // YYYY-MM-DD
  executionId: string; // the synthetic closing fill
}

/** 16:00 America/New_York on the expiry date, as a UTC ISO string. */
export function expiryCloseUtc(expiry: string): string {
  const [y = 0, m = 1, d = 1] = expiry.split('-').map(Number);
  return new Date(
    new TZDate(y, m - 1, d, 16, 0, 0, 'America/New_York').getTime(),
  ).toISOString();
}

/**
 * Options still open after their expiry close are closed at 0 by one synthetic
 * fill per account and contract, so the loss (or kept premium) is booked.
 * Input order is kept; synthetic fills come last.
 */
export function settleExpiredOptions(
  executions: readonly Execution[],
  resolve: (symbol: string) => Instrument | null,
  asOf: string,
): { executions: Execution[]; expired: ExpiredOption[] } {
  const groups = new Map<
    string,
    { accountId: string; symbol: string; net: number; last: number }
  >();
  for (const e of executions) {
    const symbol = canonicalSymbol(e.symbol);
    const key = `${e.accountId}\u0000${symbol}`;
    const g = groups.get(key) ?? {
      accountId: e.accountId,
      symbol,
      net: 0,
      last: -Infinity,
    };
    g.net += e.side === 'buy' ? e.qty : -e.qty;
    g.last = Math.max(g.last, Date.parse(e.time));
    groups.set(key, g);
  }

  const out = [...executions];
  const expired: ExpiredOption[] = [];
  for (const g of groups.values()) {
    const inst = resolve(g.symbol);
    if (inst?.assetClass !== 'option' || !inst.expiry || g.net === 0) continue;
    const close = expiryCloseUtc(inst.expiry);
    if (Date.parse(close) > Date.parse(asOf)) continue;
    const id = `${g.accountId}:${g.symbol}${SETTLEMENT}`;
    out.push({
      id,
      accountId: g.accountId,
      symbol: g.symbol,
      side: g.net > 0 ? 'sell' : 'buy',
      qty: Math.abs(g.net),
      price: 0,
      time: new Date(Math.max(Date.parse(close), g.last)).toISOString(),
      fees: 0,
      commission: 0,
    });
    expired.push({
      accountId: g.accountId,
      symbol: g.symbol,
      expiry: inst.expiry,
      executionId: id,
    });
  }
  return { executions: out, expired };
}
