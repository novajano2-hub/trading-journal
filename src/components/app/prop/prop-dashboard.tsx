'use client';

import { ChartLineUp, Funnel } from '@phosphor-icons/react/dist/ssr';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import {
  DualAxisChart,
  type DualSeries,
} from '@/components/charts/dual-axis-chart';
import { dateTicks } from '@/components/charts/chart-kit';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { MetricTip } from '@/components/ui/metric-tip';
import { Segmented } from '@/components/ui/segmented';
import { StateGlyph } from '@/components/ui/state-glyph';
import type { MetricId } from '@/content/metric-definitions';
import { metricContextOf } from '@/data/metrics';
import { usePrefs } from '@/data/query/hooks';
import { usePropFinance } from '@/data/query/derived';
import {
  DEFAULT_PROP_VIEW,
  type PropFinance,
  type PropFinanceView,
} from '@/data/prop-finance';
import type { Trade } from '@/domain/types';
import { FigureSourceContext, useDisplay } from '@/lib/display';
import { formatPct, plural } from '@/lib/format';
import { CARD, CardHeader, signTone } from '../dashboard/shared';
import { TipGlyph } from '../dashboard/widgets/frame';
import { UpperStrip } from '../dashboard/widgets/layout';
import { periodText } from '../reports/report-chart';
import {
  StateBlock,
  StrategyError,
  StrategySkeleton,
} from '../strategies/strategy-states';
import { ChallengeForm } from './challenge-form';
import { MoneyCard } from './prop-money';
import { BreachCard, PassRateCard } from './prop-insights';
import { Cash, PANEL } from './prop-parts';
import { usePropFilters } from './use-prop-filters';

const NO_TRADES: ReadonlyMap<string, Trade> = new Map();

/** The return on spend as a percentage; "None" while nothing has been spent (C32). */
function roiText(roi: number | null): string {
  if (roi === null) return 'None';
  return `${roi < 0 ? '−' : ''}${formatPct(Math.abs(roi), 1)}`;
}

function KeyCard({
  tip,
  label,
  tone = '',
  figure,
  sub,
}: {
  tip: MetricId;
  label: string;
  tone?: string;
  figure: React.ReactNode;
  sub: string;
}): React.JSX.Element {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`${CARD} flex min-w-0 flex-col px-[18px] pt-4 pb-3.5 max-sm:px-3.5 max-sm:pt-3.5 max-sm:pb-3`}
    >
      <div className="flex min-h-[22px] items-center">
        <MetricTip
          id={tip}
          basis="net"
          className="text-left text-[12.5px] text-faint"
        >
          <span id={id}>{label}</span>
        </MetricTip>
      </div>
      <span
        className={`mt-1 block text-[22px] leading-tight font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums max-sm:text-[18px] ${tone}`}
      >
        {figure}
      </span>
      <span className="mt-0.5 block text-[12.5px] leading-snug text-faint max-sm:text-[12px]">
        {sub}
      </span>
    </section>
  );
}

const accounts = (n: number, kind: string): string =>
  n === 0
    ? `No active ${kind} account`
    : `${n} active ${kind} ${plural(n, 'account')}`;

/** The five cards: the two balances, then what was spent, earned and kept (comp 04). */
function KeyCards({ d }: { d: PropFinance }): React.JSX.Element {
  const { spent, earned, net, roi, payouts } = d.totals;
  return (
    <UpperStrip label="Prop money">
      <KeyCard
        tip="prop-funded"
        label="Funded"
        figure={<Cash cents={d.funded.balance} signed={false} />}
        sub={accounts(d.funded.count, 'funded')}
      />
      <KeyCard
        tip="prop-evaluation"
        label="Evaluation"
        figure={<Cash cents={d.evaluation.balance} signed={false} />}
        sub={accounts(d.evaluation.count, 'evaluation')}
      />
      <KeyCard
        tip="prop-spent"
        label="Total spent"
        tone={signTone(-spent)}
        figure={<Cash cents={spent === 0 ? 0 : -spent} />}
        sub="fees and resets"
      />
      <KeyCard
        tip="prop-earned"
        label="Total earned"
        tone={signTone(earned)}
        figure={<Cash cents={earned} />}
        sub={
          payouts === 0
            ? 'No payouts yet'
            : `${payouts} ${plural(payouts, 'payout')}`
        }
      />
      <KeyCard
        tip="prop-net"
        label="Net"
        tone={signTone(net)}
        figure={<Cash cents={net} />}
        sub={`Return on spend ${roiText(roi)}`}
      />
    </UpperStrip>
  );
}

const WINDOWS = [
  { value: '1w', label: '1W' },
  { value: '1m', label: '1M' },
  { value: '1y', label: '1Y' },
] as const;
const WINDOW_WORDS = { '1w': '1 week', '1m': '1 month', '1y': '1 year' };

/** A running cost is drawn below zero: what went out. */
const below = (cents: number): number => (cents === 0 ? 0 : -cents);

/**
 * Return over time (C36): cumulative income, cumulative costs below zero and
 * the running net over the last week, month or year, ending on the range's
 * end or today. Hover, touch or focus reads a day; the values are in a hidden
 * table. A window with nothing in it says so rather than drawing a flat line.
 */
function ReturnCard({
  d,
  period,
  onPeriod,
}: {
  d: PropFinance;
  period: PropFinanceView['roi'];
  onPeriod(next: PropFinanceView['roi']): void;
}): React.JSX.Element {
  const id = useId();
  const display = useDisplay();
  const points = d.roi;
  const last = points[points.length - 1];
  const keys = useMemo(() => points.map((p) => p.date), [points]);
  const series = useMemo<DualSeries[]>(
    () => [
      {
        key: 'income',
        label: 'Income',
        kind: 'step',
        axis: 'left',
        unit: 'money',
        tone: 'gain',
        values: points.map((p) => p.income),
      },
      {
        key: 'costs',
        label: 'Costs',
        kind: 'step',
        axis: 'left',
        unit: 'money',
        tone: 'loss',
        values: points.map((p) => below(p.costs)),
      },
      {
        key: 'net',
        label: 'Net',
        kind: 'step',
        axis: 'left',
        unit: 'money',
        values: points.map((p) => p.net),
      },
    ],
    [points],
  );
  const xs = useMemo(() => keys.map((_, i) => i), [keys]);
  const xAxis = useMemo(
    () => ({ lo: 0, hi: Math.max(1, keys.length - 1), ticks: dateTicks(keys) }),
    [keys],
  );
  const quiet = last === undefined || (last.income === 0 && last.costs === 0);
  const words = (cents: number) => display.cash(cents, true).label;
  return (
    <section aria-labelledby={id} className={PANEL}>
      <CardHeader
        headingId={id}
        title="Return over time"
        after={
          <TipGlyph id="prop-return" basis="net" name="Return over time" />
        }
        end={
          <Segmented
            label="Period"
            options={WINDOWS}
            value={period}
            onChange={onPeriod}
            coarseTargets
          />
        }
      />
      <div className="mt-3">
        {quiet || !last ? (
          <p className="py-12 text-center text-[13.5px] text-faint">
            No income or costs in this period.
          </p>
        ) : (
          <DualAxisChart
            label={`Return over time, ${WINDOW_WORDS[period]} to ${format(parseISO(last.date), 'd MMM')}: income ${words(last.income)}, costs ${words(below(last.costs))}, net ${words(last.net)}`}
            xs={xs}
            xHeading="Day"
            pointLabel={(i) => periodText(keys[i]!)}
            xAxis={xAxis}
            series={series}
            height={190}
            dollars
          />
        )}
      </div>
    </section>
  );
}

/** Said when a figure left out accounts in another currency (C58). */
function LeftOut({ n }: { n: number }): React.JSX.Element {
  return (
    <p className="-mt-1.5 text-[12.5px] leading-[1.45] text-faint">
      {n} {plural(n, 'account')} in{' '}
      {plural(n, 'another currency', 'other currencies')}{' '}
      {plural(n, 'is', 'are')} left out.
    </p>
  );
}

/**
 * The Dashboard tab (comp 04, #45): the five cards, return over time, and
 * what the money, the evaluations and the breaches say. The six filters and
 * the global date range narrow it from the address (C37). Every amount is the
 * base currency, net, whatever the display menu says (C72); Privacy still
 * hides it. Render inside `<Suspense>`: it reads the address.
 */
export function PropDashboard(): React.JSX.Element {
  const queryClient = useQueryClient();
  const filters = usePropFilters();
  const [view, setView] = useState<PropFinanceView>(DEFAULT_PROP_VIEW);
  const finance = usePropFinance(filters.filters, view);
  const prefs = usePrefs();
  const [creating, setCreating] = useState(false);
  const ctx = useMemo(
    () => (prefs.data ? metricContextOf(prefs.data) : null),
    [prefs.data],
  );
  const error = finance.error ?? prefs.error;
  const d = finance.data;

  if (error)
    return (
      <StrategyError
        error={error}
        title="The prop dashboard couldn't load."
        onRetry={() => void queryClient.resetQueries({ queryKey: ['keel'] })}
      />
    );
  if (!d || !ctx) return <StrategySkeleton label="Loading the dashboard" />;

  const form = creating ? (
    <ChallengeForm onClose={() => setCreating(false)} />
  ) : null;
  if (d.counts.challenges === 0 && d.counts.txns === 0)
    return (
      <>
        <StateBlock
          visual={<StateGlyph icon={ChartLineUp} />}
          title="Nothing to total yet."
          body="Add a transaction or a challenge, and what you spend, earn and keep fills in here."
          actions={
            <>
              <Link
                href="/app/prop-firms/transactions?add=1"
                className={buttonClasses('secondary')}
              >
                Add transaction
              </Link>
              <Button onClick={() => setCreating(true)}>New challenge</Button>
            </>
          }
        />
        {form}
      </>
    );
  // A filter may leave a firm's own transactions and no challenge: that is still something to read.
  if (
    filters.any &&
    d.challenges.length === 0 &&
    d.totals.spent === 0 &&
    d.totals.earned === 0
  )
    return (
      <StateBlock
        visual={<StateGlyph icon={Funnel} />}
        title="No challenges match these filters."
        actions={
          <Button variant="secondary" onClick={filters.clear}>
            Clear filters
          </Button>
        }
      />
    );

  return (
    // Prop money is the base currency, net, whatever the display menu says
    // (C72): no percent base, so only Privacy changes it.
    <FigureSourceContext.Provider
      value={{ tradesById: NO_TRADES, ctx, pctBase: null }}
    >
      <KeyCards d={d} />
      {d.leftOut > 0 ? <LeftOut n={d.leftOut} /> : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <ReturnCard
          d={d}
          period={view.roi}
          onPeriod={(roi) => setView((v) => ({ ...v, roi }))}
        />
        <MoneyCard
          d={d}
          by={view.breakdown}
          onBy={(breakdown) => setView((v) => ({ ...v, breakdown }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PassRateCard
          d={d}
          by={view.passRate}
          onBy={(passRate) => setView((v) => ({ ...v, passRate }))}
        />
        <BreachCard
          d={d}
          which={view.breaches}
          onWhich={(breaches) => setView((v) => ({ ...v, breaches }))}
        />
      </div>
    </FigureSourceContext.Provider>
  );
}
