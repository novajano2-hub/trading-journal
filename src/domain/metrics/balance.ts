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

/** One day of the balance chart: what the accounts held at its close, and the net deposits and withdrawals so far. */
export interface BalancePoint {
  date: string;
  balance: Cents;
  /** The deposits and withdrawals from the range's start through this date, net. */
  flows: Cents;
}

/**
 * The balance a day at a time (C75): a point on each date that has a trading
 * day or a deposit or withdrawal, inside `range`. `days` are the net P&L of
 * every trade of the accounts, by exit day, from the beginning; `start` is the
 * accounts' starting balances. The balance is the same figure `balanceAt`
 * reads, so a range starts from everything booked before it; `flows` counts
 * only what moved inside the range.
 */
export function balanceSeries(
  days: readonly { date: string; net: Cents }[],
  start: Cents,
  flows: readonly { date: string; amount: Cents }[],
  range: { from?: string; to?: string } = {},
): BalancePoint[] {
  const dates = [
    ...new Set([...days.map((d) => d.date), ...flows.map((f) => f.date)]),
  ].sort();
  const net = new Map<string, Cents>();
  for (const d of days) net.set(d.date, (net.get(d.date) ?? 0) + d.net);
  const moved = new Map<string, Cents>();
  for (const f of flows) moved.set(f.date, (moved.get(f.date) ?? 0) + f.amount);
  let balance = start;
  let inside = 0;
  const out: BalancePoint[] = [];
  for (const date of dates) {
    balance += (net.get(date) ?? 0) + (moved.get(date) ?? 0);
    if (range.to !== undefined && date > range.to) break;
    if (range.from !== undefined && date < range.from) continue;
    inside += moved.get(date) ?? 0;
    out.push({ date, balance, flows: inside });
  }
  return out;
}
