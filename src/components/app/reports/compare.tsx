'use client';

import {
  CalendarBlank,
  ChartLineUp,
  ClockCounterClockwise,
  Scales,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { MetricTip } from '@/components/ui/metric-tip';
import { Segmented } from '@/components/ui/segmented';
import type { MetricId } from '@/content/metric-definitions';
import {
  applyFilters,
  EMPTY_FILTERS,
  parseFilters,
  resolveRange,
  sanitizeFilters,
  serializeFilters,
  type GlobalFilters,
  type Outcome,
} from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import { useGlobalFilters } from '@/data/query/derived';
import {
  useAccounts,
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { timeSeries } from '@/domain/metrics/series';
import { summarize, type Summary } from '@/domain/metrics/summary';
import { localDate } from '@/domain/time';
import { isClosed } from '@/domain/trade-status';
import type {
  Account,
  Strategy,
  Tag,
  TagCategory,
  Trade,
  UserPrefs,
} from '@/domain/types';
import {
  FigureSourceContext,
  formatUnitValue,
  pctBaseOf,
  useDisplay,
  type FigureSource,
} from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { rangeChipLabel } from '@/lib/range-label';
import { FilterChip, CheckRows, RadioRows } from '../filter-chip';
import { accountSummary, chipLabel, datesOf, toggleId } from '../filter-model';
import {
  DateBody,
  SIDE_OPTIONS,
  StrategyBody,
  SymbolBody,
  TagBody,
} from '../filter-popovers';
import { symbolOptions } from '../search';
import { CARD, CARD_PAD, CardHeader, signTone } from '../dashboard/shared';
import { ReportChart, type ChartSeries } from './report-chart';
import { ReportSkeleton, State } from './report-scope';
import { writeParam } from './use-report-data';

const GROUPS = [
  { key: 'a', name: 'Group A', colour: 'var(--accent)' },
  { key: 'b', name: 'Group B', colour: 'var(--info-fill)' },
] as const;

const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: 'win', label: 'Win' },
  { id: 'loss', label: 'Loss' },
  { id: 'breakeven', label: 'Breakeven' },
];

/**
 * A group's filters from the address: `?a=symbol%3DES%26side%3Dlong`, the global
 * filters' own serialisation as one value. A group the address doesn't name
 * falls back to `seed`.
 */
function groupFrom(
  params: URLSearchParams,
  key: string,
  seed: GlobalFilters,
): GlobalFilters {
  const value = params.get(key);
  return value === null ? seed : parseFilters(new URLSearchParams(value));
}

const writeGroup = (key: string, f: GlobalFilters) =>
  writeParam(key, serializeFilters(f).toString());

/** One group's chips: the same dimensions and popovers as the top bar's filters, on this group alone. */
function GroupFilters({
  name,
  colour,
  filters: f,
  onChange,
  symbols,
  strategies,
  tags,
  categories,
  accounts,
  today,
  count,
}: {
  name: string;
  colour: string;
  filters: GlobalFilters;
  onChange(next: GlobalFilters): void;
  symbols: string[];
  strategies: Strategy[];
  tags: Tag[];
  categories: TagCategory[];
  accounts: Account[];
  today: string;
  count: number;
}): React.JSX.Element {
  const names = useMemo(
    () => ({
      strategies: new Map(strategies.map((s) => [s.id, s.name])),
      tags: new Map(tags.map((t) => [t.id, t.name])),
    }),
    [strategies, tags],
  );
  const symbol = chipLabel('symbol', f, names);
  const side = chipLabel('side', f, names);
  const strategy = chipLabel('strategy', f, names);
  const tag = chipLabel('tag', f, names);
  const range = f.range;
  const dateActive =
    'preset' in range || range.from !== undefined || range.to !== undefined;
  const outcome =
    f.outcomes.length === 0
      ? 'Outcome'
      : f.outcomes
          .map((o) => OUTCOMES.find((x) => x.id === o)!.label)
          .join(', ');
  return (
    <section
      aria-label={name}
      className={`${CARD} ${CARD_PAD} flex min-w-0 flex-col gap-3`}
    >
      <div className="flex min-h-7 items-center gap-2.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-[4px]"
          style={{ background: colour }}
        />
        <h2 className="text-[15px] leading-snug font-semibold tracking-[-0.015em] text-text">
          {name}
        </h2>
        <span className="ml-auto text-[12.5px] text-faint tabular-nums">
          {count} closed {plural(count, 'trade')}
        </span>
      </div>
      <div
        role="group"
        aria-label={`${name} filters`}
        className="flex flex-wrap items-center gap-1.5"
      >
        <FilterChip
          label={rangeChipLabel(f.range, datesOf(f.range, today))}
          title="Date"
          active={dateActive}
          onClear={() => onChange({ ...f, range: {} })}
          wide
          icon={CalendarBlank}
          alwaysSet
        >
          {(close) => (
            <DateBody
              range={f.range}
              today={today}
              onChange={(r) => onChange({ ...f, range: r })}
              close={close}
            />
          )}
        </FilterChip>
        <FilterChip
          label={symbol.text}
          title="Symbol"
          active={symbol.active}
          onClear={() => onChange({ ...f, symbols: [] })}
        >
          {() => (
            <SymbolBody
              symbols={symbols}
              selected={f.symbols}
              onChange={(s) => onChange({ ...f, symbols: s })}
            />
          )}
        </FilterChip>
        <FilterChip
          label={side.text}
          title="Side"
          active={side.active}
          onClear={() => onChange({ ...f, side: undefined })}
        >
          {() => (
            <RadioRows
              legend="Side"
              options={SIDE_OPTIONS}
              value={f.side ?? 'both'}
              onChange={(v) =>
                onChange({ ...f, side: v === 'both' ? undefined : v })
              }
            />
          )}
        </FilterChip>
        <FilterChip
          label={strategy.text}
          title="Strategy"
          active={strategy.active}
          onClear={() => onChange({ ...f, strategyIds: [] })}
        >
          {() => (
            <StrategyBody
              strategies={strategies}
              selected={f.strategyIds}
              onChange={(ids) => onChange({ ...f, strategyIds: ids })}
            />
          )}
        </FilterChip>
        <FilterChip
          label={tag.text}
          title="Tags"
          active={tag.active}
          onClear={() => onChange({ ...f, tagIds: [] })}
        >
          {() => (
            <TagBody
              tags={tags}
              categories={categories}
              selected={f.tagIds}
              onChange={(ids) => onChange({ ...f, tagIds: ids })}
            />
          )}
        </FilterChip>
        <FilterChip
          label={f.outcomes.length === 0 ? 'Outcome' : outcome}
          title="Outcome"
          active={f.outcomes.length > 0}
          onClear={() => onChange({ ...f, outcomes: [] })}
        >
          {() => (
            <CheckRows
              legend="Outcome"
              items={OUTCOMES}
              selected={f.outcomes}
              onToggle={(id) =>
                onChange({
                  ...f,
                  outcomes: toggleId(f.outcomes, id) as Outcome[],
                })
              }
            />
          )}
        </FilterChip>
        <FilterChip
          label={accountSummary(accounts, f)}
          title="Account"
          active={f.accountIds.length > 0}
          onClear={() => onChange({ ...f, accountIds: [] })}
        >
          {() => (
            <CheckRows
              legend="Accounts"
              items={accounts.map((a) => ({ id: a.id, label: a.name }))}
              selected={f.accountIds}
              onToggle={(id) =>
                onChange({ ...f, accountIds: toggleId(f.accountIds, id) })
              }
            />
          )}
        </FilterChip>
      </div>
    </section>
  );
}

type Kind = 'money' | 'count' | 'pct' | 'ratio' | 'r';

const ROWS: {
  id: MetricId;
  label?: string;
  kind: Kind;
  get(s: Summary): number | null;
}[] = [
  {
    id: 'pnl',
    kind: 'money',
    get: (s) => (s.basis === 'gross' ? s.grossPnl : s.netPnl),
  },
  { id: 'trades', kind: 'count', get: (s) => s.closedCount },
  { id: 'win-rate', kind: 'pct', get: (s) => s.winRate },
  { id: 'profit-factor', kind: 'ratio', get: (s) => s.profitFactor },
  { id: 'expectancy', kind: 'money', get: (s) => s.expectancy },
  { id: 'avg-win', kind: 'money', get: (s) => s.avgWin },
  { id: 'avg-loss', kind: 'money', get: (s) => s.avgLoss },
  {
    id: 'realized-r',
    label: 'Average R',
    kind: 'r',
    get: (s) => s.avgRealizedR,
  },
];

const signOf = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');

/** Both groups' cumulative lines on the same days: a day a group has no exit holds its last value. */
function alignCumulative(
  groups: readonly { key: string; value: number | null }[][],
): { key: string; value: number | null }[][] {
  const keys = [...new Set(groups.flatMap((g) => g.map((p) => p.key)))].sort();
  return groups.map((g) => {
    const byKey = new Map(g.map((p) => [p.key, p.value]));
    let last: number | null = null;
    return keys.map((key) => {
      last = byKey.get(key) ?? last;
      return { key, value: last };
    });
  });
}

interface Loaded {
  trades: Trade[];
  accounts: Account[];
  strategies: Strategy[];
  tags: Tag[];
  categories: TagCategory[];
  prefs: UserPrefs;
}

function Compared({
  trades,
  accounts,
  strategies,
  tags,
  categories,
  prefs,
}: Loaded): React.JSX.Element {
  const params = useSearchParams();
  const display = useDisplay();
  const { filters: global } = useGlobalFilters();
  const base = useMemo(() => metricContextOf(prefs), [prefs]);
  const today = useMemo(
    () => localDate(new Date().toISOString(), prefs.timeZone),
    [prefs.timeZone],
  );
  const search = params.toString();
  const known = useMemo(
    () => ({
      accountIds: new Set(accounts.map((a) => a.id)),
      strategyIds: new Set(strategies.map((s) => s.id)),
      tagIds: new Set(tags.map((t) => t.id)),
    }),
    [accounts, strategies, tags],
  );
  // Group A starts from the global filters; Group B starts empty.
  const filters = useMemo(() => {
    const p = new URLSearchParams(search);
    return [
      sanitizeFilters(groupFrom(p, 'a', global), known),
      sanitizeFilters(groupFrom(p, 'b', EMPTY_FILTERS), known),
    ];
    // `global` is the URL's filters as an object; `search` already covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, known]);

  const env = useMemo(
    () => ({
      timeZone: prefs.timeZone,
      today,
      accounts,
      breakevenRange: prefs.breakevenRange,
      pnlBasis: prefs.pnlBasis,
    }),
    [prefs, today, accounts],
  );
  const picked = useMemo(
    () =>
      filters.map((f) => ({
        trades: applyFilters(trades, f, env),
        dayTrades: applyFilters(trades, { ...f, range: {} }, env),
        ctx: { ...base, range: resolveRange(f.range, today) },
      })),
    [filters, trades, env, base, today],
  );

  const currencies = useMemo(() => {
    const present = new Set(
      picked.flatMap((g) =>
        g.trades.filter(isClosed).map((t) => t.pnlCurrency),
      ),
    );
    return [...present].sort((a, b) =>
      a === prefs.baseCurrency
        ? -1
        : b === prefs.baseCurrency
          ? 1
          : a < b
            ? -1
            : 1,
    );
  }, [picked, prefs.baseCurrency]);
  const chosen = params.get('cur');
  const currency =
    currencies.find((c) => c === chosen) ?? currencies[0] ?? prefs.baseCurrency;

  const results = useMemo(
    () =>
      picked.map((g) => {
        const own = g.trades.filter((t) => t.pnlCurrency === currency);
        const dayOwn = g.dayTrades.filter((t) => t.pnlCurrency === currency);
        return {
          summary: summarize(own, base),
          cumulative: timeSeries(dayOwn, g.ctx, 'cumulative-net', 'day'),
        };
      }),
    [picked, currency, base],
  );
  const lines = useMemo(
    () => alignCumulative(results.map((r) => r.cumulative)),
    [results],
  );

  const source = useMemo<FigureSource>(
    () => ({
      tradesById: new Map(
        trades.filter((t) => t.pnlCurrency === currency).map((t) => [t.id, t]),
      ),
      ctx: base,
      pctBase: pctBaseOf({
        accounts,
        trades,
        accountIds: [],
        currency,
        timeZone: prefs.timeZone,
      }),
    }),
    [trades, currency, base, accounts, prefs.timeZone],
  );

  const symbols = useMemo(() => symbolOptions(trades), [trades]);
  const series: ChartSeries[] = GROUPS.map((g, i) => ({
    label: g.name,
    kind: 'line',
    unit: 'money',
    points: lines[i]!,
  }));

  const cell = (kind: Kind, v: number | null): ReactNode => {
    if (v === null) return <span className="text-faint">None</span>;
    switch (kind) {
      case 'money':
        return (
          <span className={signTone(v)}>
            <FigureText f={display.cash(v, true, currency)} />
          </span>
        );
      case 'count':
        return String(v);
      case 'pct':
        return formatPct(v, 1);
      case 'ratio':
        return v.toFixed(2);
      case 'r':
        return formatUnitValue('r', v, { currency, signed: true });
    }
  };
  const difference = (
    kind: Kind,
    a: number | null,
    b: number | null,
  ): ReactNode => {
    if (a === null || b === null)
      return <span className="text-faint">None</span>;
    const d = a - b;
    switch (kind) {
      case 'money':
        return cell(kind, d);
      case 'count':
        return `${signOf(d)}${Math.abs(d)}`;
      case 'pct': {
        const pts = Number((d * 100).toFixed(1));
        return `${signOf(pts)}${Math.abs(pts).toFixed(1)} pts`;
      }
      case 'ratio': {
        const x = Number(d.toFixed(2));
        return `${signOf(x)}${Math.abs(x).toFixed(2)}`;
      }
      case 'r':
        return formatUnitValue('r', d, { currency, signed: true });
    }
  };

  const nA = results[0]!.summary.closedCount;
  const nB = results[1]!.summary.closedCount;

  return (
    <FigureSourceContext.Provider value={source}>
      <div
        data-testid="reports-compare"
        className="flex min-w-0 flex-col gap-4"
      >
        {currencies.length > 1 ? (
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Currency"
              options={currencies.map((c) => ({ value: c, label: c }))}
              value={currency}
              onChange={(c) => writeParam('cur', c)}
            />
            <p className="text-[12.5px] text-faint">
              Each currency is shown on its own. Converting between them waits
              on exchange rates.
            </p>
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          {GROUPS.map((g, i) => (
            <GroupFilters
              key={g.key}
              name={g.name}
              colour={g.colour}
              filters={filters[i]!}
              onChange={(next) => writeGroup(g.key, next)}
              symbols={symbols}
              strategies={strategies}
              tags={tags}
              categories={categories}
              accounts={accounts}
              today={today}
              count={i === 0 ? nA : nB}
            />
          ))}
        </div>
        <p className="-mt-1 text-[12.5px] text-faint">
          Group A starts from the filters on the other reports, Group B from
          none. Each group has its own, and the address holds both, so a
          comparison can be linked.
        </p>

        <section
          aria-label="Comparison"
          className={`${CARD} ${CARD_PAD} min-w-0`}
        >
          <CardHeader
            icon={Scales}
            tone="accent"
            headingId="compare-heading"
            title="Side by side"
            after={
              <span className="text-[12.5px] text-faint">
                Difference is Group A minus Group B
              </span>
            }
          />
          <div className="mt-2 overflow-x-auto">
            <table
              aria-label="Comparison"
              className="w-full min-w-[420px] border-collapse text-[13.5px]"
            >
              <thead>
                <tr>
                  <td className="h-9" />
                  {[...GROUPS.map((g) => g.name), 'Difference'].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="h-9 text-right text-xs font-medium text-faint"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const a = r.get(results[0]!.summary);
                  const b = r.get(results[1]!.summary);
                  return (
                    <tr key={r.id} className="border-t border-line/70">
                      <th
                        scope="row"
                        className="h-10 text-left font-normal text-muted"
                      >
                        <MetricTip id={r.id} basis={base.pnlBasis}>
                          {r.label}
                        </MetricTip>
                      </th>
                      <td className="h-10 text-right font-semibold tabular-nums">
                        {cell(r.kind, a)}
                      </td>
                      <td className="h-10 text-right font-semibold tabular-nums">
                        {cell(r.kind, b)}
                      </td>
                      <td className="h-10 text-right font-semibold tabular-nums text-muted">
                        {difference(r.kind, a, b)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section
          aria-labelledby="compare-chart"
          className={`${CARD} ${CARD_PAD}`}
        >
          <CardHeader
            icon={ChartLineUp}
            tone="accent"
            headingId="compare-chart"
            title="Cumulative P&L"
            after={
              <span className="text-[12.5px] text-faint">
                By realization date, each group over its own date range
              </span>
            }
          />
          <div className="mt-3">
            <ReportChart
              label="Cumulative P&L, Group A and Group B"
              series={series}
              overlay
              height={300}
              currency={currency}
            />
          </div>
        </section>
      </div>
    </FigureSourceContext.Provider>
  );
}

/**
 * Reports, Compare: two groups of trades, each with its own filters (date,
 * symbol, side, strategy, tags, outcome, account), their summaries side by side
 * with the differences, and both cumulative lines on one chart. Group A starts
 * from the global filters and Group B from none; both are kept in the address
 * (`?a=...&b=...`, the filters' own serialisation), so a comparison is linkable.
 * Render inside `<Suspense>`.
 */
export function CompareView(): React.JSX.Element {
  const trades = useTrades();
  const accounts = useAccounts();
  const strategies = useStrategies();
  const tags = useTags();
  const categories = useTagCategories();
  const prefs = usePrefs();
  const error =
    trades.error ??
    accounts.error ??
    strategies.error ??
    tags.error ??
    categories.error ??
    prefs.error;
  if (error)
    return (
      <State
        role="alert"
        icon={Warning}
        title={
          error instanceof StorageUnavailableError
            ? "Keel can't open storage in this browser, so your workspace can't load."
            : "The comparison couldn't load."
        }
        actions={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      />
    );
  if (
    !trades.data ||
    !accounts.data ||
    !strategies.data ||
    !tags.data ||
    !categories.data ||
    !prefs.data
  )
    return <ReportSkeleton />;
  if (trades.data.length === 0)
    return (
      <State
        icon={ClockCounterClockwise}
        title="No trades in this workspace yet."
        body="Import a CSV from your broker, and the reports fill in."
        actions={
          <Link href="/app/import" className={buttonClasses('primary')}>
            Import
          </Link>
        }
      />
    );
  return (
    <Compared
      trades={trades.data}
      accounts={accounts.data}
      strategies={strategies.data}
      tags={tags.data}
      categories={categories.data}
      prefs={prefs.data}
    />
  );
}
