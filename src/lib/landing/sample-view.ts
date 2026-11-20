import { SAMPLE_EXECUTIONS, SAMPLE_START } from '@/content/landing-sample';
import { resolveInstrument } from '@/domain/instruments';
import { breakdown, type BreakdownKey } from '@/domain/metrics/breakdowns';
import { dailyPnl, type DayStat } from '@/domain/metrics/days';
import { defaultMetricContext } from '@/domain/metrics/context';
import {
  equityCurve,
  maxDrawdown,
  type Drawdown,
  type EquityPoint,
} from '@/domain/metrics/equity';
import { summarize, type Summary } from '@/domain/metrics/summary';
import { evaluateProp, type PropStatus } from '@/domain/prop/evaluate';
import { buildTrades } from '@/domain/trade-builder';
import type {
  Cents,
  PropRuleSet,
  Tag,
  TagCategory,
  Trade,
} from '@/domain/types';
import { formatPnl } from '@/lib/format';
import { ticketTime } from '@/lib/ticket-format';

export { SAMPLE_EXECUTIONS, SAMPLE_START };

export interface TicketModel {
  serial: number;
  side: 'buy' | 'sell';
  symbol: string;
  qty: number;
  price: string;
  time: string; // 'DD MMM HH:MM:SS' (capitals) in America/New_York
  netPnl: string;
  r?: string;
  stamp?: 'RULE BROKEN' | 'A+ SETUP';
}

export interface SampleView {
  trades: Trade[];
  summary: Summary;
  days: DayStat[];
  drawdown: Drawdown;
  equity: EquityPoint[];
  prop: PropStatus;
  heroTickets: TicketModel[];
  tags: Tag[];
  tagNames: Record<string, string>;
  breakdowns: Record<BreakdownTab, BreakdownRowView[]>;
}

export type BreakdownTab = 'hour' | 'session' | 'setup' | 'symbol' | 'mistake';
export interface BreakdownRowView {
  key: string;
  label: string;
  /** Net P&L in cents. */
  net: Cents;
}

const TIME_ZONE = 'America/New_York';
const NOW = '2026-11-20T21:00:00Z';
const HERO_SERIALS = [8, 6, 5, 3];
const BROKEN_RULE_SERIAL = 6;
const STAMPS: Record<number, TicketModel['stamp']> = {
  [BROKEN_RULE_SERIAL]: 'RULE BROKEN',
  5: 'A+ SETUP',
};

const SETUP_BY_SERIAL: Record<number, string> = {
  1: 'Opening range break',
  2: 'Breakout',
  3: 'Pullback',
  4: 'Opening range break',
  5: 'Fade',
  6: 'Breakout',
  7: 'Range',
  8: 'Opening range break',
};
const MISTAKE_BY_SERIAL: Record<number, string> = { 6: 'Moved stop' };

function makeTags(): Tag[] {
  const tag = (name: string, category: TagCategory): Tag => ({
    id: `tag-${category}-${name.toLowerCase().replace(/\s+/g, '-')}`,
    workspaceId: 'sample',
    name,
    category,
  });
  return [...new Set(Object.values(SETUP_BY_SERIAL))]
    .map((n) => tag(n, 'setup'))
    .concat(
      [...new Set(Object.values(MISTAKE_BY_SERIAL))].map((n) =>
        tag(n, 'mistake'),
      ),
    );
}

const HOURS_SHOWN = [9, 10, 11, 12, 13, 14, 15];

export const SAMPLE_PROP_RULES: PropRuleSet = {
  firm: 'Sample',
  phase: 'evaluation',
  profitTarget: 300_000,
  dailyLossLimit: 100_000,
  maxDrawdown: 200_000,
  drawdownType: 'trailing',
  minTradingDays: 5,
  consistencyPct: 0.5,
};

function decimalsOf(tickSize: number): number {
  const s = String(tickSize);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** A price at the instrument's tick precision, e.g. 21100 → '21100.00' for NQ. */
export function ticketPrice(t: Trade, price: number): string {
  return price.toFixed(decimalsOf(t.instrument.tickSize));
}

function toTicket(t: Trade): TicketModel {
  const first = t.executions[0];
  const stamp = STAMPS[t.serial];
  return {
    serial: t.serial,
    side: first?.side ?? (t.direction === 'long' ? 'buy' : 'sell'),
    symbol: t.instrument.symbol,
    qty: t.maxPosition,
    price: ticketPrice(t, t.avgEntry),
    time: ticketTime(t.openedAt),
    netPnl: formatPnl(t.net, t.pnlCurrency),
    ...(stamp ? { stamp } : {}),
  };
}

export function getSampleView(): SampleView {
  const tags = makeTags();
  const tagId = (name: string) => tags.find((t) => t.name === name)!.id;
  const built = buildTrades(SAMPLE_EXECUTIONS, {
    workspaceId: 'sample',
    startSerial: 1,
    resolve: (s) => resolveInstrument(s),
    accountCurrency: () => 'USD',
  }).trades;
  const trades = built.map((t) => {
    const setup = SETUP_BY_SERIAL[t.serial];
    const mistake = MISTAKE_BY_SERIAL[t.serial];
    const tagged: Trade = {
      ...t,
      tagIds: [
        ...(setup ? [tagId(setup)] : []),
        ...(mistake ? [tagId(mistake)] : []),
      ],
    };
    return t.serial === BROKEN_RULE_SERIAL
      ? { ...tagged, ruleChecks: [{ ruleId: 'r-stop', followed: false }] }
      : tagged;
  });
  const ctx = defaultMetricContext(TIME_ZONE);
  const tagNames = Object.fromEntries(tags.map((t) => [t.id, t.name]));
  const view = (rows: ReturnType<typeof breakdown>): BreakdownRowView[] =>
    rows.map((r) => ({ key: r.key, label: r.label, net: r.summary.netPnl }));
  const by = (key: BreakdownKey, ts: Trade[] = trades) =>
    view(breakdown(ts, key, { ...ctx, tagNames }));
  const onlyCategory = (category: TagCategory) =>
    trades.map((t) => ({
      ...t,
      tagIds: t.tagIds.filter(
        (id) => tags.find((x) => x.id === id)?.category === category,
      ),
    }));
  const start: Cents = SAMPLE_START;
  const bySerial = new Map(trades.map((t) => [t.serial, t]));
  return {
    trades,
    summary: summarize(trades, ctx),
    days: dailyPnl(trades, ctx),
    drawdown: maxDrawdown(trades, start, ctx),
    equity: equityCurve(trades, start, ctx),
    prop: evaluateProp({
      startingBalance: start,
      rules: SAMPLE_PROP_RULES,
      trades,
      timeZone: TIME_ZONE,
      now: NOW,
    }),
    tags,
    tagNames,
    breakdowns: {
      hour: by('hour').filter((r) => HOURS_SHOWN.includes(Number(r.key))),
      session: by('session'),
      setup: by('tag', onlyCategory('setup')),
      symbol: by('symbol'),
      mistake: by('tag', onlyCategory('mistake')),
    },
    heroTickets: HERO_SERIALS.flatMap((n) => {
      const t = bySerial.get(n);
      return t ? [toTicket(t)] : [];
    }),
  };
}
