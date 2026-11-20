import { SAMPLE_EXECUTIONS, SAMPLE_START } from '@/content/landing-sample';
import { resolveInstrument } from '@/domain/instruments';
import { breakdown, type BreakdownKey } from '@/domain/metrics/breakdowns';
import { dailyPnl, type DayStat } from '@/domain/metrics/days';
import { defaultMetricContext, type PnlBasis } from '@/domain/metrics/context';
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
  BreakevenRange,
  Cents,
  PropRuleSet,
  Rule,
  Tag,
  TagCategory,
  Trade,
} from '@/domain/types';
import { formatPnl } from '@/lib/format';
import { onTradingDate, ticketTime } from '@/lib/ticket-format';

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
  /** Engine breakdowns on each P&L basis, so gross is re-derived, never adjusted by hand. */
  breakdowns: Record<PnlBasis, Record<BreakdownTab, BreakdownRowView[]>>;
  /** The sample strategy's rules. */
  rules: Rule[];
  /** A trade's rule checks as text plus kept or broken, in rule order. */
  checksFor: (trade: Trade) => RuleCheckView[];
  /** The sample week as one range, e.g. '16-20 Nov 2026'. */
  weekLabel: string;
  /** The breakeven range every figure above is classified with. */
  breakeven: BreakevenRange;
}

export interface RuleCheckView {
  text: string;
  ok: boolean;
}

export type BreakdownTab = 'hour' | 'session' | 'setup' | 'symbol' | 'mistake';
export interface BreakdownRowView {
  key: string;
  label: string;
  /** P&L in cents on the breakdown's basis (gross or net). */
  pnl: Cents;
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
const EMOTION_BY_SERIAL: Record<number, string> = { 6: 'Impatient' };

const TAGS_BY_CATEGORY: [TagCategory, Record<number, string>][] = [
  ['setup', SETUP_BY_SERIAL],
  ['mistake', MISTAKE_BY_SERIAL],
  ['emotion', EMOTION_BY_SERIAL],
];

function makeTags(): Tag[] {
  const tag = (name: string, category: TagCategory): Tag => ({
    id: `tag-${category}-${name.toLowerCase().replace(/\s+/g, '-')}`,
    workspaceId: 'sample',
    name,
    category,
  });
  return TAGS_BY_CATEGORY.flatMap(([category, bySerial]) =>
    [...new Set(Object.values(bySerial))].map((n) => tag(n, category)),
  );
}

export const SAMPLE_RULES: Rule[] = [
  { id: 'r-entry', text: 'Entered on the range break', group: 'entry' },
  { id: 'r-risk', text: 'Risk no more than 1R per trade', group: 'risk' },
  { id: 'r-stop', text: 'Stop stays where it was placed', group: 'management' },
  { id: 'r-two-losses', text: 'No new trade after two losses', group: 'risk' },
];
/** Trade 6 is graded against every rule; it moved its stop. */
const BROKEN_RULE_ID = 'r-stop';

/** '16-20 Nov 2026' within a month, '30 Nov-4 Dec 2026' across months. */
function rangeLabel(first: string, last: string): string {
  const day = (d: string) => onTradingDate(d, { day: 'numeric' });
  const month = (d: string) => onTradingDate(d, { month: 'short' });
  const year = (d: string) => onTradingDate(d, { year: 'numeric' });
  if (first === last) return `${day(first)} ${month(first)} ${year(first)}`;
  const start =
    month(first) === month(last) && year(first) === year(last)
      ? day(first)
      : year(first) === year(last)
        ? `${day(first)} ${month(first)}`
        : `${day(first)} ${month(first)} ${year(first)}`;
  return `${start}-${day(last)} ${month(last)} ${year(last)}`;
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
    const tagged: Trade = {
      ...t,
      tagIds: TAGS_BY_CATEGORY.flatMap(([, bySerial]) => {
        const name = bySerial[t.serial];
        return name ? [tagId(name)] : [];
      }),
    };
    return t.serial === BROKEN_RULE_SERIAL
      ? {
          ...tagged,
          ruleChecks: SAMPLE_RULES.map((r) => ({
            ruleId: r.id,
            followed: r.id !== BROKEN_RULE_ID,
          })),
        }
      : tagged;
  });
  const ctx = defaultMetricContext(TIME_ZONE);
  const tagNames = Object.fromEntries(tags.map((t) => [t.id, t.name]));
  const basisPnl = (s: Summary) =>
    s.basis === 'gross' ? s.grossPnl : s.netPnl;
  const view = (rows: ReturnType<typeof breakdown>): BreakdownRowView[] =>
    rows.map((r) => ({
      key: r.key,
      label: r.label,
      pnl: basisPnl(r.summary),
    }));
  const onlyCategory = (category: TagCategory) =>
    trades.map((t) => ({
      ...t,
      tagIds: t.tagIds.filter(
        (id) => tags.find((x) => x.id === id)?.category === category,
      ),
    }));
  const breakdownsOn = (
    pnlBasis: PnlBasis,
  ): Record<BreakdownTab, BreakdownRowView[]> => {
    const by = (key: BreakdownKey, ts: Trade[] = trades) =>
      view(breakdown(ts, key, { ...ctx, pnlBasis, tagNames }));
    return {
      hour: by('hour').filter((r) => HOURS_SHOWN.includes(Number(r.key))),
      session: by('session'),
      setup: by('tag', onlyCategory('setup')),
      symbol: by('symbol'),
      mistake: by('tag', onlyCategory('mistake')),
    };
  };
  const start: Cents = SAMPLE_START;
  const bySerial = new Map(trades.map((t) => [t.serial, t]));
  const days = dailyPnl(trades, ctx);
  const ruleText = new Map(SAMPLE_RULES.map((r) => [r.id, r.text]));
  return {
    trades,
    summary: summarize(trades, ctx),
    days,
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
    breakdowns: { net: breakdownsOn('net'), gross: breakdownsOn('gross') },
    rules: SAMPLE_RULES,
    checksFor: (t) =>
      t.ruleChecks.flatMap((c) => {
        const text = ruleText.get(c.ruleId);
        return text && c.followed !== null ? [{ text, ok: c.followed }] : [];
      }),
    weekLabel: rangeLabel(days[0]!.date, days[days.length - 1]!.date),
    breakeven: ctx.breakevenRange,
    heroTickets: HERO_SERIALS.flatMap((n) => {
      const t = bySerial.get(n);
      return t ? [toTicket(t)] : [];
    }),
  };
}
