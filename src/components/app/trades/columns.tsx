import {
  createColumnHelper,
  rowSortingFeature,
  createSortedRowModel,
  rowPaginationFeature,
  createPaginatedRowModel,
  tableFeatures,
  type ColumnDef,
} from '@tanstack/react-table';
import { Chip, SideChip } from '@/components/ui/chip';
import { FigureText } from '@/components/product/figure-text';
import { COLUMN_LABELS, type ColumnId } from '@/data/trade-columns';
import {
  heldMs,
  netRoiOf,
  plannedR,
  rOf,
  type RowFacts,
} from '@/data/trade-rows';
import { type MetricContext } from '@/domain/metrics/context';
import type { Trade } from '@/domain/types';
import { formatDuration } from '@/lib/format';
import { formatUnitValue, tradeFigure, type Display } from '@/lib/display';
import { shortTime } from '@/lib/time-format';
import { InstrumentName, TradeTime, signTone } from '../dashboard/shared';
import {
  MistakesCell,
  RatingCell,
  ReviewedCell,
  RulesCell,
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
  reviewed: 'center',
};

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
  'rules',
  'rating',
  'reviewed',
]);

const helper = createColumnHelper<typeof features, Trade>();

/** Decimals in a tick size: 0.25 is 2, 0.00001 is 5. */
function tickDecimals(tick: number): number {
  if (!(tick > 0)) return 6;
  const text = tick.toString();
  const exp = /e-(\d+)$/.exec(text);
  if (exp) return Number(exp[1]);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** A price to its instrument's tick: 6,227.25, 1.10254. At least two decimals, so averages never run on. */
export const price = (n: number, tick: number) => {
  const digits = Math.max(2, Math.min(6, tickDecimals(tick)));
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};
export const qty = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 4 });

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
    case 'rules': {
      const r = env.facts.rules(t);
      return r.checked === 0 ? undefined : r.kept / r.checked;
    }
    case 'rating':
      return t.rating;
    case 'reviewed':
      return t.reviewed === true ? 1 : 0;
    case 'status':
      return t.status;
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

function cellOf(id: ColumnId, t: Trade, env: CellEnv): React.ReactNode {
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
        <span className="text-faint">No risk</span>
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
      return <TagsCell tags={facts.tagsOf(t)} />;
    case 'mistakes':
      return <MistakesCell names={facts.mistakesOf(t)} />;
    case 'rules':
      return <RulesCell rules={facts.rules(t)} />;
    case 'rating':
      return <RatingCell rating={t.rating} />;
    case 'reviewed':
      return <ReviewedCell reviewed={t.reviewed === true} />;
    case 'status':
      return (
        <Chip tone={t.status === 'open' ? 'accent' : 'neutral'}>
          {t.status === 'open' ? 'Open' : 'Closed'}
        </Chip>
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
