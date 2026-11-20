import { SAMPLE_EXECUTIONS, SAMPLE_START } from '@/content/landing-sample';
import { resolveInstrument } from '@/domain/instruments';
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
import type { Cents, PropRuleSet, Trade } from '@/domain/types';
import { formatPnl } from '@/lib/format';

export { SAMPLE_EXECUTIONS, SAMPLE_START };

export interface TicketModel {
  serial: number;
  side: 'buy' | 'sell';
  symbol: string;
  qty: number;
  price: string;
  time: string; // 'DD MMM HH:MM:SS' in America/New_York
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
}

const TIME_ZONE = 'America/New_York';
const NOW = '2026-11-20T21:00:00Z';
const HERO_SERIALS = [8, 6, 5, 3];
const BROKEN_RULE_SERIAL = 6;
const STAMPS: Record<number, TicketModel['stamp']> = {
  [BROKEN_RULE_SERIAL]: 'RULE BROKEN',
  5: 'A+ SETUP',
};

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

function ticketTime(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: TIME_ZONE,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${parts.month} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function toTicket(t: Trade): TicketModel {
  const first = t.executions[0];
  const stamp = STAMPS[t.serial];
  return {
    serial: t.serial,
    side: first?.side ?? (t.direction === 'long' ? 'buy' : 'sell'),
    symbol: t.instrument.symbol,
    qty: t.maxPosition,
    price: t.avgEntry.toFixed(decimalsOf(t.instrument.tickSize)),
    time: ticketTime(t.openedAt),
    netPnl: formatPnl(t.net, t.pnlCurrency),
    ...(stamp ? { stamp } : {}),
  };
}

export function getSampleView(): SampleView {
  const built = buildTrades(SAMPLE_EXECUTIONS, {
    workspaceId: 'sample',
    startSerial: 1,
    resolve: (s) => resolveInstrument(s),
    accountCurrency: () => 'USD',
  }).trades;
  const trades = built.map((t) =>
    t.serial === BROKEN_RULE_SERIAL
      ? { ...t, ruleChecks: [{ ruleId: 'r-stop', followed: false }] }
      : t,
  );
  const ctx = defaultMetricContext(TIME_ZONE);
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
    heroTickets: HERO_SERIALS.flatMap((n) => {
      const t = bySerial.get(n);
      return t ? [toTicket(t)] : [];
    }),
  };
}
