import { balanceSeries } from '../metrics/balance';
import type { MetricContext } from '../metrics/context';
import { dailyPnl, daySummary } from '../metrics/days';
import { realizations } from '../metrics/realized';
import { summarize } from '../metrics/summary';
import { localDate } from '../time';
import { closedInOrder } from '../trade-status';
import type {
  Account,
  CashFlow,
  Cents,
  Challenge,
  ChallengeStep,
  Trade,
} from '../types';
import type { ChallengeCheck } from './challenge';

/**
 * What the challenge details page reads of one phase: the account's trades
 * from the phase's start, its balance a day, an hour or a trade at a time
 * (C65), the five figures under the chart, and the state each phase tab
 * carries. Pure, on closed trades and net P&L as the firm's rules count them.
 */

/** Every trade of the account in the account's own currency: what it holds, whatever a phase's start date. */
export function accountTrades(
  account: Account,
  trades: readonly Trade[],
): Trade[] {
  return trades.filter(
    (t) => t.accountId === account.id && t.pnlCurrency === account.currency,
  );
}

/** The account's trades from the phase's start day (a local day, by the day each closed); all of them with no start. */
export function phaseTradesOf(
  startDate: string | undefined,
  all: readonly Trade[],
  timeZone: string,
): Trade[] {
  return all.filter(
    (t) =>
      startDate === undefined ||
      localDate(t.closedAt ?? t.openedAt, timeZone) >= startDate,
  );
}

export type BalanceMode = 'day' | 'hour' | 'trade';

/** One point of the balance chart. */
export interface PhasePoint {
  /** The local day (YYYY-MM-DD) the point is at. */
  date: string;
  /** The local hour 0 to 23, for an hour's point. */
  hour?: number;
  /** The trade and the instant it closed, for a trade's point. */
  tradeId?: string;
  at?: string;
  /** What the account holds at the point. */
  balance: Cents;
}

const hourFormats = new Map<string, Intl.DateTimeFormat>();

/** The local hour 0 to 23 of an instant. */
function localHour(iso: string, timeZone: string): number {
  let f = hourFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hourCycle: 'h23',
    });
    hourFormats.set(timeZone, f);
  }
  return Number(f.format(Date.parse(iso))) % 24;
}

/**
 * The account's balance over the phase (C65), from its start: a point at each
 * trading day's close (and each date with a deposit or withdrawal), at the end
 * of each hour with an exit, or after each closed trade. A point is what the
 * account holds then: its starting balance, the deposits and withdrawals dated
 * on or before the point's day, and the net P&L booked through it, so the
 * first point of a phase that starts late carries everything before it. A day
 * books each exit on its own date; a trade books whole when it closes. All
 * three end at the same figure. `trades` are the account's (`accountTrades`).
 */
export function phaseBalance(
  mode: BalanceMode,
  input: {
    account: Account;
    flows: readonly CashFlow[];
    trades: readonly Trade[];
    startDate?: string;
    timeZone: string;
  },
): PhasePoint[] {
  const { account, trades, startDate, timeZone } = input;
  const flows = input.flows
    .filter((f) => f.accountId === account.id)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const from = startDate === undefined ? {} : { from: startDate };

  if (mode === 'day')
    return balanceSeries(
      dailyPnl(trades, {
        timeZone,
        breakevenRange: { unit: 'amount', from: 0, to: 0 },
        pnlBasis: 'net',
      }),
      account.startingBalance,
      flows,
      from,
    ).map((p) => ({ date: p.date, balance: p.balance }));

  // Hours and trades walk the exits in time order, taking each deposit or
  // withdrawal in as the walk reaches its day.
  let balance = account.startingBalance;
  let next = 0;
  const reach = (date: string) => {
    while (next < flows.length && flows[next]!.date <= date)
      balance += flows[next++]!.amount;
  };
  const kept = (date: string) => startDate === undefined || date >= startDate;

  if (mode === 'trade') {
    const out: PhasePoint[] = [];
    for (const t of closedInOrder(trades)) {
      const date = localDate(t.closedAt, timeZone);
      reach(date);
      balance += t.net;
      if (kept(date))
        out.push({ date, tradeId: t.id, at: t.closedAt, balance });
    }
    return out;
  }

  const exits = trades
    .flatMap((t) =>
      realizations(t).map((r) => ({
        time: r.time,
        net: r.net,
        serial: t.serial,
      })),
    )
    .sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time) || a.serial - b.serial,
    );
  const out: PhasePoint[] = [];
  for (const x of exits) {
    const date = localDate(x.time, timeZone);
    const hour = localHour(x.time, timeZone);
    reach(date);
    balance += x.net;
    if (!kept(date)) continue;
    const last = out[out.length - 1];
    if (last && last.date === date && last.hour === hour)
      last.balance = balance;
    else out.push({ date, hour, balance });
  }
  return out;
}

/** The five figures under the balance chart. */
export interface PhaseStats {
  /** Closed trades read. */
  trades: number;
  /** Wins over wins plus losses, as the summary has it (a breakeven is left out); null with no decided trade. */
  winRate: number | null;
  avgWin: Cents | null;
  /** Negative. */
  avgLoss: Cents | null;
  /** The best and the worst trading day's net, whatever their sign; null with no day. */
  bestDay: Cents | null;
  worstDay: Cents | null;
}

/**
 * Win rate, average win, average loss and the best and worst day of the
 * phase's trades. Always net money (the module's rule), the profile's
 * breakeven range applies, and a display unit never narrows them.
 */
export function phaseStats(
  trades: readonly Trade[],
  ctx: MetricContext,
): PhaseStats {
  const net: MetricContext = {
    timeZone: ctx.timeZone,
    breakevenRange: ctx.breakevenRange,
    pnlBasis: 'net',
  };
  const s = summarize(trades, net);
  const days = daySummary(dailyPnl(trades, net), net);
  return {
    trades: s.closedCount,
    winRate: s.winRate,
    avgWin: s.avgWin,
    avgLoss: s.avgLoss,
    bestDay: days.best?.net ?? null,
    worstDay: days.worst?.net ?? null,
  };
}

export type PhaseState = 'passed' | 'active' | 'breached' | 'not-started';

/**
 * What each phase tab says of its phase. The `current` phase (the one the
 * rule check reads) is breached when the challenge is, passed when the trader
 * called it passed or its target is met, else active; the phases before it
 * have passed and the ones after it have not started.
 */
export function phaseStates(
  c: Challenge,
  check: ChallengeCheck,
  current: ChallengeStep,
): Record<ChallengeStep, PhaseState> {
  const order = c.phases.map((p) => p.step);
  const at = order.indexOf(current);
  const out = {} as Record<ChallengeStep, PhaseState>;
  order.forEach((step, i) => {
    if (i < at) out[step] = 'passed';
    else if (i > at) out[step] = 'not-started';
    else if (c.status === 'breached') out[step] = 'breached';
    else if (
      c.phase === 'evaluation' &&
      (c.status === 'passed' ||
        check.phases.find((p) => p.step === step)?.state?.overall ===
          'target-reached')
    )
      out[step] = 'passed';
    else out[step] = 'active';
  });
  return out;
}
