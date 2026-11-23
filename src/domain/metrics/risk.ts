import type { Cents } from '../types';
import type { DayStat } from './days';

const TRADING_DAYS = 252;

/**
 * Daily return = day net / balance at that day's start (starting balance + earlier nets
 * + the deposits and withdrawals dated before that day; `flows` are those dated after the
 * start balance's day, a flow dated on a day is not in that day's base).
 * Sharpe = mean / sample standard deviation x sqrt(252). Sortino = mean / sqrt(sum of
 * min(0, r)^2 / n) x sqrt(252). Risk-free rate 0. Days that start with no balance are skipped.
 * Both are null with fewer than two days; Sortino is also null with no losing day.
 */
export function riskRatios(
  days: readonly DayStat[],
  startBalance: Cents,
  flows: readonly { date: string; amount: Cents }[] = [],
): { sharpe: number | null; sortino: number | null } {
  const returns: number[] = [];
  let balance = startBalance;
  const ordered = [...flows].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  let next = 0;
  for (const d of days) {
    while (next < ordered.length && ordered[next]!.date < d.date)
      balance += ordered[next++]!.amount;
    if (balance > 0) returns.push(d.net / balance);
    balance += d.net;
  }
  const n = returns.length;
  if (n < 2) return { sharpe: null, sortino: null };
  const mean = returns.reduce((s, r) => s + r, 0) / n;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  const downside = Math.sqrt(
    returns.reduce((s, r) => s + Math.min(0, r) ** 2, 0) / n,
  );
  const annual = Math.sqrt(TRADING_DAYS);
  return {
    sharpe: sd === 0 ? null : (mean / sd) * annual,
    sortino: downside === 0 ? null : (mean / downside) * annual,
  };
}
