import {
  createColumnHelper,
  rowSortingFeature,
  createSortedRowModel,
  rowPaginationFeature,
  createPaginatedRowModel,
  tableFeatures,
  type ColumnDef,
} from '@tanstack/react-table';
import { SideChip } from '@/components/ui/chip';
import { FigureText } from '@/components/product/figure-text';
import { COLUMN_LABELS, type ColumnId } from '@/data/trade-columns';
import {
  heldMs,
  netRoiOf,
  plannedR,
  rOf,
  statusOf,
  STATUS_RANK,
  type RowFacts,
} from '@/data/trade-rows';
import { type MetricContext } from '@/domain/metrics/context';
import type { PatternHit } from '@/domain/patterns';
import type { Trade } from '@/domain/types';
import { formatDuration, formatQty, price } from '@/lib/format';
import { formatUnitValue, tradeFigure, type Display } from '@/lib/display';
import { dayLabel, shortTime } from '@/lib/time-format';
import { dayOfTrade } from '@/data/day-log';
import { InstrumentName, TradeTime, signTone } from '../dashboard/shared';
import {
  MistakesCell,
  RatingCell,
  ReviewedCell,
  RulesCell,
  StatusChip,
  TickerPill,
  StrategiesCell,
  TagsCell,
  TradeLink,
} from './cells';

export {
  ALL_COLUMNS,
  DEFAULT_COLUMNS,
  type ColumnId,
} from '@/data/trade-columns';

/** The table's features: sort and page the rows; the columns shown are the log's own list. */
export const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

/** What a cell needs besides its trade. */
export interface CellEnv {
  timeZone: string;
  /** The prefs' metric context: the P&L basis and the breakeven range. */
  ctx: MetricContext;
  display: Display;
  facts: RowFacts;
  /** The Day column as "Thu 19 Nov", for the Week view's table; elsewhere it carries the year. */
  shortDay?: boolean;
  /**
   * The patterns that fired, by trade id (`usePatterns().byTrade`). The log's
   * Patterns column and a phone row's count read it; the Day and Week views
   * pass none and have no such column. `undefined` while they are computed.
   */
  patterns?: ReadonlyMap<string, readonly PatternHit[]>;
}

/** How a column's text sits. */
export const ALIGN: Partial<Record<ColumnId, 'right' | 'center'>> = {
  qty: 'right',
  entry: 'right',
  exit: 'right',
  gross: 'right',
  fees: 'right',
  net: 'right',
  roi: 'right',
  realizedR: 'right',
  plannedR: 'right',
  duration: 'right',
  patterns: 'right',
  reviewed: 'center',
};

/**
 * Each column's width in px, close to comp 01's colgroup (comp 02 adds Patterns).
 * The table is fixed-layout, so a cell never pushes a neighbour: its text
 * truncates inside its own width. Qty holds "25,000" (shares, lots, coins).
 * The default columns sum to 1,152px with the select box, so they fit the
 * log's card at 1440 with no sideways scroll: Strategy keeps room for "Opening
 * range breakout" (its header is at least 165px there) and Tags, which ends in
 * an ellipsis by design, takes what is left. Patterns is a count under a
 * header whose sort mark hangs off its left (`HANG_SORT`).
 */
export const COLUMN_WIDTHS: Record<ColumnId, number> = {
  open: 78,
  close: 78,
  instrument: 88,
  account: 110,
  side: 50,
  qty: 46,
  entry: 62,
  exit: 62,
  gross: 72,
  fees: 58,
  net: 72,
  roi: 54,
  realizedR: 46,
  plannedR: 58,
  duration: 56,
  strategies: 166,
  tags: 104,
  mistakes: 110,
  patterns: 50,
  rules: 74,
  rating: 54,
  reviewed: 58,
  status: 72,
  ticker: 78,
  day: 116,
};

/**
 * Columns whose sort mark hangs off the left of the header's label instead of
 * taking room of its own, so a narrow column (a count) keeps its label inside
 * its width and out of the next header.
 */
export const HANG_SORT = new Set<ColumnId>(['patterns']);

/** Columns whose text starts after a gap, so a right-aligned neighbour's header never runs into it. */
export const PAD_LEFT = new Set<ColumnId>(['strategies']);

/** The columns that open on their largest, then smallest; text ones run A to Z first. */
const DESC_FIRST = new Set<ColumnId>([
  'open',
  'close',
  'qty',
  'entry',
  'exit',
  'gross',
  'fees',
  'net',
  'roi',
  'realizedR',
  'plannedR',
  'duration',
  'patterns',
  'rules',
  'rating',
  'reviewed',
  'day',
]);

const helper = createColumnHelper<typeof features, Trade>();

export const qty = formatQty;

/** A column's text-or-number value for sorting; undefined sorts last. */
function sortValue(
  id: ColumnId,
  t: Trade,
  env: CellEnv,
): string | number | undefined {
  switch (id) {
    case 'open':
      return Date.parse(t.openedAt);
    case 'close':
      return t.closedAt === undefined ? undefined : Date.parse(t.closedAt);
    case 'instrument':
      return t.instrument.symbol.toLowerCase();
    case 'account':
      return env.facts.accountName(t).toLowerCase();
    case 'side':
      return t.direction;
    case 'qty':
      return t.maxPosition;
    case 'entry':
      return t.avgEntry;
    case 'exit':
      return t.avgExit;
    case 'gross':
      return t.gross;
    case 'fees':
      return t.fees;
    case 'net':
      return t.net;
    case 'roi':
      return netRoiOf(t);
    case 'realizedR':
      return rOf(t, env.ctx.pnlBasis);
    case 'plannedR':
      return plannedR(t);
    case 'duration':
      return heldMs(t);
    case 'strategies':
      return env.facts.strategyNames(t)[0]?.toLowerCase();
    case 'tags':
      return env.facts.tagsOf(t)[0]?.name.toLowerCase();
    case 'mistakes':
      return env.facts.mistakesOf(t)[0]?.toLowerCase();
    case 'patterns':
      return env.patterns === undefined
        ? undefined
        : (env.patterns.get(t.id)?.length ?? 0);
    case 'rules': {
      const r = env.facts.rules(t);
      return r.checked === 0 ? undefined : r.kept / r.checked;
    }
    case 'rating':
      return t.rating;
    case 'reviewed':
      return t.reviewed === true ? 1 : 0;
    case 'status':
      return STATUS_RANK[statusOf(t, env.ctx)];
    case 'ticker':
      return t.instrument.root.toLowerCase();
    case 'day':
      return dayOfTrade(t, env.timeZone);
  }
}

function compare(a: string | number, b: string | number): number {
  return typeof a === 'string' && typeof b === 'string'
    ? a.localeCompare(b)
    : Number(a) - Number(b);
}

/** A signed ratio cell, "−51.86%" or "+1.55R", in gain or loss ink. */
function Ratio({
  value,
  unit,
  currency,
}: {
  value: number;
  unit: 'percent' | 'r';
  currency: string;
}): React.JSX.Element {
  return (
    <span className={signTone(value)}>
      {formatUnitValue(unit, value, { currency, signed: true })}
    </span>
  );
}

/** How many patterns fired on a trade: a plain count, in the faint ink when none did; empty while they are computed. */
export function PatternCount({
  env,
  trade,
}: {
  env: CellEnv;
  trade: Trade;
}): React.JSX.Element | null {
  if (env.patterns === undefined) return null;
  const n = env.patterns.get(trade.id)?.length ?? 0;
  return <span className={n === 0 ? 'text-faint' : undefined}>{n}</span>;
}

export function cellOf(id: ColumnId, t: Trade, env: CellEnv): React.ReactNode {
  const { display, facts, timeZone } = env;
  const money = (cents: number, basis: 'net' | 'gross' | null) => {
    const fig =
      basis === null
        ? { money: cents }
        : tradeFigure(t, { ...env.ctx, pnlBasis: basis });
    return (
      <span className={`font-[550] ${signTone(cents)}`}>
        <FigureText f={display.figure(fig, basis !== null, t.pnlCurrency)} />
      </span>
    );
  };
  switch (id) {
    case 'open':
      return <TradeTime text={shortTime(t.openedAt, timeZone)} />;
    case 'close':
      return t.closedAt === undefined ? (
        <span className="text-faint">Open</span>
      ) : (
        <TradeTime text={shortTime(t.closedAt, timeZone)} />
      );
    case 'instrument':
      return (
        <TradeLink id={t.id}>
          <InstrumentName
            trade={t}
            timeZone={timeZone}
            showExpiry={false}
            className="flex-nowrap!"
          />
        </TradeLink>
      );
    case 'account':
      return <span className="truncate">{facts.accountName(t)}</span>;
    case 'side':
      return <SideChip side={t.direction} />;
    case 'qty':
      return qty(t.maxPosition);
    case 'entry':
      return price(t.avgEntry, t.instrument.tickSize);
    case 'exit':
      return t.avgExit === undefined ? (
        <span className="text-faint">Open</span>
      ) : (
        price(t.avgExit, t.instrument.tickSize)
      );
    case 'gross':
      return money(t.gross, 'gross');
    case 'fees':
      return money(t.fees, null);
    case 'net':
      return money(t.net, 'net');
    case 'roi': {
      const roi = netRoiOf(t);
      return roi === undefined ? (
        <span className="text-faint">None</span>
      ) : (
        <Ratio value={roi} unit="percent" currency={t.pnlCurrency} />
      );
    }
    case 'realizedR': {
      if (t.status !== 'closed') return null;
      const r = rOf(t, env.ctx.pnlBasis);
      return r === undefined ? (
        <span className="text-faint">None</span>
      ) : (
        <Ratio value={r} unit="r" currency={t.pnlCurrency} />
      );
    }
    case 'plannedR': {
      const r = plannedR(t);
      return r === undefined ? (
        <span className="text-faint">None</span>
      ) : (
        <span>{r.toFixed(2)}R</span>
      );
    }
    case 'duration': {
      const ms = heldMs(t);
      return ms === undefined ? null : (
        <span className="text-muted">{formatDuration(ms)}</span>
      );
    }
    case 'strategies':
      return <StrategiesCell names={facts.strategyNames(t)} />;
    case 'tags':
      return <TagsCell tags={facts.tagsOf(t)} mistakes={facts.mistakesOf(t)} />;
    case 'mistakes':
      return <MistakesCell names={facts.mistakesOf(t)} />;
    case 'patterns':
      return <PatternCount env={env} trade={t} />;
    case 'rules':
      return <RulesCell rules={facts.rules(t)} />;
    case 'rating':
      return <RatingCell rating={t.rating} />;
    case 'reviewed':
      return <ReviewedCell reviewed={t.reviewed === true} />;
    case 'status':
      return <StatusChip status={statusOf(t, env.ctx)} />;
    case 'ticker':
      return <TickerPill root={t.instrument.root} />;
    case 'day':
      return (
        <span className="tabular-nums">
          {dayLabel(dayOfTrade(t, timeZone), { year: !env.shortDay })}
        </span>
      );
  }
}

/** Column definitions for `ids`, in that order. */
export function buildColumns(
  ids: readonly ColumnId[],
  env: CellEnv,
): ColumnDef<typeof features, Trade>[] {
  return ids.map(
    (id) =>
      // The value type differs per column; the table reads it as unknown.
      helper.accessor((t) => sortValue(id, t, env), {
        id,
        header: COLUMN_LABELS[id].label,
        cell: (info) => cellOf(id, info.row.original, env),
        sortFn: (a, b) => {
          const x = a.getValue<string | number | undefined>(id);
          const y = b.getValue<string | number | undefined>(id);
          if (x === undefined || y === undefined) return 0;
          return compare(x, y);
        },
        sortUndefined: 'last',
        sortDescFirst: DESC_FIRST.has(id),
        enableSorting: id !== 'tags' && id !== 'mistakes',
      }) as unknown as ColumnDef<typeof features, Trade>,
  );
}
