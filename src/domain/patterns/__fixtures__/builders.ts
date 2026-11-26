import { makeTrade } from '@/domain/__fixtures__/trades';
import { resolveInstrument } from '@/domain/instruments';
import type { Cents, Execution, Trade } from '@/domain/types';
import type { PatternEnv, PatternHit, PatternId } from '../defs';
import { computePatterns } from '../index';

export const SEC = 1_000;
export const MIN = 60 * SEC;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Day 0 of the tests: Monday 2026-01-05, read in UTC. */
const DAY0 = Date.UTC(2026, 0, 5);

/** The instant `h:m:s` UTC on test day `n`; the default is 14:00. */
export function at(n: number, h = 14, m = 0, s = 0): number {
  return DAY0 + n * DAY + h * HOUR + m * MIN + s * SEC;
}

/** The date of test day `n`, as the trade log reads it in UTC. */
export function dateOf(n: number): string {
  return new Date(DAY0 + n * DAY).toISOString().slice(0, 10);
}

export const iso = (ms: number): string => new Date(ms).toISOString();

export interface Spec {
  id?: string;
  /** The entry instant. */
  open: number;
  /** Time held, for a closed trade; omitted: five minutes. */
  hold?: number;
  /** Net P&L in cents; omitted: a win of 100. */
  net?: Cents;
  status?: 'open' | 'closed';
  /** The size: `maxPosition`, and the entry fills' total when fills are asked for. */
  volume?: number;
  direction?: 'long' | 'short';
  /** The instrument's symbol; omitted: ESZ5. */
  symbol?: string;
  /** Entry fills to build; with `exits`, the trade carries fills. */
  entries?: number;
  /** Exit fills to build. */
  exits?: number;
  risk?: Cents;
  extra?: Partial<Trade>;
}

let serial = 0;

function fills(t: Trade, entries: number, exits: number): Execution[] {
  const long = t.direction === 'long';
  const make = (kind: 'in' | 'out', i: number, n: number): Execution => ({
    id: `${t.id}-${kind}-${i}`,
    accountId: t.accountId,
    symbol: t.instrument.symbol,
    side: (kind === 'in') === long ? 'buy' : 'sell',
    qty: t.maxPosition / n,
    price: 4500,
    time:
      kind === 'in'
        ? new Date(Date.parse(t.openedAt) + i * SEC).toISOString()
        : new Date(
            Date.parse(t.closedAt ?? t.openedAt) - (n - 1 - i) * SEC,
          ).toISOString(),
    fees: 0,
    commission: 0,
  });
  return [
    ...Array.from({ length: entries }, (_, i) => make('in', i, entries)),
    ...Array.from({ length: exits }, (_, i) => make('out', i, exits)),
  ];
}

/** A valid ES trade for the tests; every spec field is optional but the entry. */
export function mk(s: Spec): Trade {
  serial += 1;
  const closed = (s.status ?? 'closed') === 'closed';
  const t = makeTrade({
    id: s.id ?? `p-${serial}`,
    serial,
    net: s.net ?? 100,
    direction: s.direction ?? 'long',
    status: closed ? 'closed' : 'open',
    openedAt: iso(s.open),
    ...(closed ? { closedAt: iso(s.open + (s.hold ?? 5 * MIN)) } : {}),
    ...(s.symbol ? { instrument: resolveInstrument(s.symbol)! } : {}),
    maxPosition: s.volume ?? 1,
    ...(s.risk !== undefined ? { initialRisk: s.risk } : {}),
    ...s.extra,
  });
  if (s.entries !== undefined || s.exits !== undefined)
    t.executions = fills(t, s.entries ?? 1, s.exits ?? (closed ? 1 : 0));
  return t;
}

/**
 * The trades of test day `n`: one per item (a net, or a spec without its
 * entry), entered `step` apart from 14:00, so a day reads in entry order.
 */
export function onDay(
  n: number,
  items: readonly (number | Omit<Spec, 'open'>)[],
  step = 10 * MIN,
): Trade[] {
  return items.map((it, i) =>
    mk({
      open: at(n) + i * step,
      ...(typeof it === 'number' ? { net: it } : it),
    }),
  );
}

/**
 * A day's trades one after another from 14:00: each held `hold`, entered
 * `gap` after the one before exited.
 */
export function chain(
  n: number,
  rows: readonly { hold: number; gap?: number; net: Cents }[],
): Trade[] {
  let cursor = at(n);
  return rows.map((r) => {
    const open = cursor + (r.gap ?? 0);
    cursor = open + r.hold;
    return mk({ open, hold: r.hold, net: r.net });
  });
}

export const ENV: PatternEnv = {
  timeZone: 'UTC',
  breakevenRange: { unit: 'amount', from: 0, to: 0 },
  sessions: new Map(),
};

export const env = (over: Partial<PatternEnv> = {}): PatternEnv => ({
  ...ENV,
  ...over,
});

export function run(trades: readonly Trade[], over: Partial<PatternEnv> = {}) {
  return computePatterns(trades, env(over));
}

export type Result = ReturnType<typeof run>;

export function tradeHit(
  r: Result,
  t: Trade,
  id: PatternId,
): PatternHit | undefined {
  return r.byTrade.get(t.id)?.find((h) => h.id === id);
}

export function dayHit(
  r: Result,
  n: number,
  id: PatternId,
): PatternHit | undefined {
  return r.byDay.get(dateOf(n))?.find((h) => h.id === id);
}
