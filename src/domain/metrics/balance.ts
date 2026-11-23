import { localDate } from '../time';
import type { Account, Cents, CashFlow, Trade } from '../types';
import type { MetricContext } from './context';
import { realizations } from './realized';

/** The local date before `date` (both YYYY-MM-DD). */
export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * What the accounts hold at the end of `date`: their starting balances, the
 * deposits and withdrawals dated on or before it, and the net they realized
 * through it. A trade is booked by its exits (each exit on its own local date,
 * in `ctx.timeZone`), not at its close, so a position held over the date has
 * only the exits made by then in it. Only the accounts given count: pass the
 * selected ones, and the trades and flows of others are ignored.
 */
export function balanceAt(
  accounts: readonly Account[],
  flows: readonly CashFlow[],
  trades: readonly Trade[],
  date: string,
  ctx: Pick<MetricContext, 'timeZone'>,
): Cents {
  const ids = new Set(accounts.map((a) => a.id));
  let balance = accounts.reduce((n, a) => n + a.startingBalance, 0);
  for (const f of flows)
    if (ids.has(f.accountId) && f.date <= date) balance += f.amount;
  for (const t of trades) {
    if (!ids.has(t.accountId)) continue;
    for (const r of realizations(t))
      if (localDate(r.time, ctx.timeZone) <= date) balance += r.net;
  }
  return balance;
}
