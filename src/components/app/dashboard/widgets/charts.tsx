'use client';

import { format, parseISO } from 'date-fns';
import { useMemo, type ReactNode } from 'react';
import {
  DualAxisChart,
  type DualSeries,
} from '@/components/charts/dual-axis-chart';
import {
  formatterOf,
  periodText,
  ReportChart,
} from '@/components/app/reports/report-chart';
import { WIDGET_TITLES } from '@/content/dashboard-widgets';
import { usePrefs } from '@/data/query/hooks';
import { WIDGETS } from '@/domain/dashboard/widgets';
import type { MetricContext } from '@/domain/metrics/context';
import { dayValue, type DayStat } from '@/domain/metrics/days';
import { clockText, timeAxis } from '@/domain/metrics/scatter';
import {
  seriesUnit,
  type SeriesPoint,
  type SeriesUnit,
} from '@/domain/metrics/series';
import { isTradeUnit } from '@/domain/metrics/units';
import type { WidgetKey } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { formatCount, plural } from '@/lib/format';
import { zoneLabel } from '@/lib/time-zone-label';
import { noBalanceIn, STARTING_BALANCE_PROMPT } from './balance-states';
import { useWidgetCtx, useWidgetPage, useWidgetValue } from './context';
import { WidgetFrame } from './frame';
import type { WidgetRender } from './registry';
import { sentenceCase } from './text';

/**
 * The chart widgets (#46): the running and the daily net P&L, the two on one
 * chart, the drawdown, the win rate and the averages through the day and the
 * account balance. The first four and the drawdown reuse the Reports page's
 * `ReportChart`; the three that carry a second scale (C14, C15, C75) are
 * `DualAxisChart`. Each is an image with a label that says the range and its
 * key values, a table for assistive technology and a hover and focus readout.
 * Money goes through `useDisplay()`, axes, readouts, tables and labels alike,
 * so the unit and Privacy apply to all of them.
 */

const NONE = 'No closed trades in this range.';

/** A widget's name, following the Gross or Net basis where it carries one. */
function titleOf(key: WidgetKey, basis: 'net' | 'gross'): string {
  const word = basis === 'gross' ? 'gross' : 'net';
  switch (key) {
    case 'cum-pnl':
      return `Cumulative ${word} P&L`;
    case 'daily-pnl':
      return `${sentenceCase(word)} daily P&L`;
    case 'daily-cum':
      return `Daily and cumulative ${word} P&L`;
    default:
      return WIDGET_TITLES[key];
  }
}

/** The frame of a chart widget: its name, its tip and the range or what it is by. */
function Card({
  k,
  caption,
  end,
  state = 'ready',
  empty,
  children,
}: {
  k: WidgetKey;
  caption?: ReactNode;
  end?: ReactNode;
  state?: 'ready' | 'loading' | 'empty';
  empty?: ReactNode;
  children?: ReactNode;
}): React.JSX.Element {
  const basis = usePrefs().data?.pnlBasis ?? 'net';
  return (
    <WidgetFrame
      widgetKey={k}
      title={titleOf(k, basis)}
      tip={WIDGETS[k].metric}
      caption={caption}
      end={end}
      state={state}
      empty={empty}
    >
      {children}
    </WidgetFrame>
  );
}

const Loading = ({ k }: { k: WidgetKey }) => <Card k={k} state="loading" />;

/** Rounds away binary noise from a running total of units. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/** The days' values in the display unit, and their running total. */
function dayPoints(
  days: readonly DayStat[],
  ctx: MetricContext,
): { daily: SeriesPoint[]; running: SeriesPoint[] } {
  let total = 0;
  const daily = days.map((d) => ({ key: d.date, value: dayValue(d, ctx) }));
  const running = daily.map((p) => {
    total = clean(total + p.value);
    return { key: p.key, value: total };
  });
  return { daily, running };
}

/**
 * Where a chart of days is labelled on its x axis: every day when there are
 * few, else the first trading day of each month (the chart drops any that
 * would touch).
 */
function dateTicks(keys: readonly string[]): { at: number; text: string }[] {
  if (keys.length <= 40)
    return keys.map((k, i) => ({ at: i, text: format(parseISO(k), 'd MMM') }));
  const out: { at: number; text: string }[] = [];
  let last = '';
  keys.forEach((k, i) => {
    const month = k.slice(0, 7);
    if (month === last) return;
    last = month;
    out.push({
      at: i,
      text: format(
        parseISO(`${month}-01`),
        month.endsWith('-01') ? 'MMM yyyy' : 'MMM',
      ),
    });
  });
  return out;
}

/** What every chart widget reads besides its own series. */
function useChartEnv() {
  const page = useWidgetPage();
  const ctx = useWidgetCtx();
  const display = useDisplay();
  const basis = usePrefs().data?.pnlBasis ?? 'net';
  const fmt = useMemo(
    () => (page ? formatterOf(display, page.currency) : undefined),
    // `display` is rebuilt on every render; what it reads is the unit and the currency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display.unit, page?.currency],
  );
  return { page, ctx, display, basis, fmt };
}

/** The running net P&L at the close of each trading day, the whole range. */
export function CumPnl(): React.JSX.Element {
  const days = useWidgetValue('cum-pnl');
  const { page, ctx, basis, fmt } = useChartEnv();
  const points = useMemo(
    () => (days && ctx ? dayPoints(days, ctx).running : undefined),
    [days, ctx],
  );
  if (!days || !page || !ctx || !fmt || !points) return <Loading k="cum-pnl" />;
  const caption = sentenceCase('by trading day');
  if (days.length === 0)
    return <Card k="cum-pnl" state="empty" empty={NONE} caption={caption} />;
  const unit = seriesUnit('cumulative-net', ctx);
  const ends = points[points.length - 1]!.value!;
  return (
    <Card k="cum-pnl" caption={caption}>
      <div className="mt-3">
        <ReportChart
          label={`Cumulative ${basis} P&L by day, ${page.caption}. Ends at ${fmt.text(unit, ends)}.`}
          currency={page.currency}
          height={190}
          expandSlot={null}
          series={[
            {
              label: `Cumulative ${basis} P&L`,
              kind: 'line',
              unit,
              points,
            },
          ]}
        />
      </div>
    </Card>
  );
}

/** Each trading day's net P&L as a bar: gain above the line, loss below. */
export function DailyPnl(): React.JSX.Element {
  const days = useWidgetValue('daily-pnl');
  const { page, ctx, basis, fmt } = useChartEnv();
  const points = useMemo(
    () => (days && ctx ? dayPoints(days, ctx).daily : undefined),
    [days, ctx],
  );
  if (!days || !page || !ctx || !fmt || !points)
    return <Loading k="daily-pnl" />;
  const caption = sentenceCase('by trading day');
  if (days.length === 0)
    return <Card k="daily-pnl" state="empty" empty={NONE} caption={caption} />;
  const unit = seriesUnit('net', ctx);
  const best = points.reduce((a, p) => (p.value! > a.value! ? p : a));
  const worst = points.reduce((a, p) => (p.value! < a.value! ? p : a));
  return (
    <Card k="daily-pnl" caption={caption}>
      <div className="mt-3">
        <ReportChart
          label={`Daily ${basis} P&L bars, ${points.length} ${plural(points.length, 'day')}, ${page.caption}. Best ${periodText(best.key)} ${fmt.text(unit, best.value!)}, worst ${periodText(worst.key)} ${fmt.text(unit, worst.value!)}.`}
          currency={page.currency}
          height={190}
          expandSlot={null}
          series={[
            {
              label: `${sentenceCase(basis)} P&L`,
              kind: 'bar',
              unit,
              points,
            },
          ]}
        />
      </div>
    </Card>
  );
}

/** How far the running net P&L sat under its high, each trading day: the chart, nothing else. */
export function Drawdown(): React.JSX.Element {
  // The widget's series is already the distance under the high, a point a trading day.
  const points = useWidgetValue('drawdown');
  const { page, fmt } = useChartEnv();
  if (!page || !fmt || !points) return <Loading k="drawdown" />;
  const caption = sentenceCase('by trading day');
  if (points.length === 0)
    return <Card k="drawdown" state="empty" empty={NONE} caption={caption} />;
  // The curve starts at its high, so its lowest point is the max drawdown.
  const deepest = Math.min(0, ...points.map((p) => p.value));
  return (
    <Card k="drawdown" caption={caption}>
      <div className="mt-3">
        <ReportChart
          label={`Drawdown from the daily P&L peak, ${page.caption}. ${deepest === 0 ? 'No fall from a peak.' : `Max drawdown ${fmt.text('money', deepest)}.`}`}
          currency={page.currency}
          height={170}
          expandSlot={null}
          series={[
            {
              label: 'Drawdown',
              kind: 'line',
              unit: 'money',
              tone: 'loss',
              points,
            },
          ]}
        />
      </div>
    </Card>
  );
}

/** Day bars on the left scale and the running total on the right, on one chart. */
export function DailyCum(): React.JSX.Element {
  const days = useWidgetValue('daily-cum');
  const { page, ctx, basis, fmt } = useChartEnv();
  const both = useMemo(
    () => (days && ctx ? dayPoints(days, ctx) : undefined),
    [days, ctx],
  );
  const keys = useMemo(() => days?.map((d) => d.date) ?? [], [days]);
  const xs = useMemo(() => keys.map((_, i) => i), [keys]);
  const xAxis = useMemo(
    () => ({ lo: -0.5, hi: keys.length - 0.5, ticks: dateTicks(keys) }),
    [keys],
  );
  const unit: SeriesUnit = ctx ? seriesUnit('net', ctx) : 'money';
  const series = useMemo<DualSeries[]>(
    () =>
      both
        ? [
            {
              key: 'day',
              label: 'Day net, left scale',
              kind: 'bars',
              axis: 'left',
              unit,
              tone: 'signed',
              values: both.daily.map((p) => p.value),
            },
            {
              key: 'running',
              label: 'Running total, right scale',
              kind: 'line',
              axis: 'right',
              unit,
              values: both.running.map((p) => p.value),
            },
          ]
        : [],
    [both, unit],
  );
  if (!days || !page || !ctx || !fmt || !both) return <Loading k="daily-cum" />;
  const caption = sentenceCase('by trading day');
  if (days.length === 0)
    return <Card k="daily-cum" state="empty" empty={NONE} caption={caption} />;
  const ends = both.running[both.running.length - 1]!.value!;
  return (
    <Card k="daily-cum" caption={caption}>
      <div className="mt-3">
        <DualAxisChart
          label={`Daily ${basis} P&L bars and the running total, ${days.length} ${plural(days.length, 'day')}, ${page.caption}. Ends at ${fmt.text(unit, ends)}.`}
          currency={page.currency}
          xs={xs}
          xHeading="Day"
          pointLabel={(i) => periodText(keys[i]!)}
          xAxis={xAxis}
          series={series}
          alignZero
        />
      </div>
    </Card>
  );
}

/** The closed trades through the day, by the time they closed: the running win rate on the left, the averages on the right. */
export function WinAvg(): React.JSX.Element {
  const points = useWidgetValue('win-avg');
  const { page, ctx, fmt } = useChartEnv();
  const minutes = useMemo(() => points?.map((p) => p.minute) ?? [], [points]);
  const oneDay =
    ctx?.range?.from !== undefined && ctx.range.from === ctx.range.to;
  const xAxis = useMemo(() => timeAxis(minutes, oneDay), [minutes, oneDay]);
  const unit: SeriesUnit = ctx?.unit ? 'tradeunit' : 'money';
  const series = useMemo<DualSeries[]>(
    () =>
      points
        ? [
            {
              key: 'win-rate',
              label: 'Win rate, left scale',
              kind: 'line',
              axis: 'left',
              unit: 'pct',
              values: points.map((p) => p.winRate),
            },
            {
              key: 'avg-win',
              label: 'Average win, right scale',
              kind: 'line',
              axis: 'right',
              unit,
              tone: 'muted',
              values: points.map((p) => p.avgWin),
            },
            {
              key: 'avg-loss',
              label: 'Average loss, right scale',
              kind: 'line',
              axis: 'right',
              unit,
              tone: 'muted',
              dashed: true,
              values: points.map((p) => p.avgLoss),
            },
          ]
        : [],
    [points, unit],
  );
  if (!points || !page || !ctx || !fmt) return <Loading k="win-avg" />;
  const caption = sentenceCase('through the day');
  if (points.length === 0)
    return <Card k="win-avg" state="empty" empty={NONE} caption={caption} />;
  const last = points[points.length - 1]!;
  const say = (u: SeriesUnit, v: number | null) =>
    v === null ? 'none' : fmt.text(u, v);
  return (
    <Card k="win-avg" caption={caption}>
      <div className="mt-3">
        <DualAxisChart
          label={`Win rate, average win and average loss through the day, ${page.caption}. After ${formatCount(last.trades)} ${plural(last.trades, 'trade')}: win rate ${say('pct', last.winRate)}, average win ${say(unit, last.avgWin)}, average loss ${say(unit, last.avgLoss)}.`}
          currency={page.currency}
          xs={minutes}
          xHeading="Closed at"
          pointLabel={(i) =>
            `${clockText(points[i]!.minute)}, after ${formatCount(points[i]!.trades)} ${plural(points[i]!.trades, 'trade')}`
          }
          xAxis={xAxis}
          series={series}
          height={210}
          note={`Time of day in ${zoneLabel(ctx.timeZone)}`}
        />
      </div>
    </Card>
  );
}

/** The accounts' balance on the left scale and the net deposits and withdrawals on the right. */
export function Balance(): React.JSX.Element {
  const data = useWidgetValue('balance');
  const { page, display, fmt } = useChartEnv();
  const points = data?.points;
  const dates = useMemo(() => points?.map((p) => p.date) ?? [], [points]);
  const xs = useMemo(() => dates.map((_, i) => i), [dates]);
  const xAxis = useMemo(
    () => ({ lo: -0.5, hi: dates.length - 0.5, ticks: dateTicks(dates) }),
    [dates],
  );
  const moved = points?.some((p) => p.flows !== 0) ?? false;
  const series = useMemo<DualSeries[]>(
    () =>
      points
        ? [
            {
              key: 'balance',
              label: 'Balance, left scale',
              kind: 'line',
              axis: 'left',
              unit: 'balance',
              values: points.map((p) => p.balance),
            },
            ...(moved
              ? [
                  {
                    key: 'flows',
                    label: 'Deposits and withdrawals, net, right scale',
                    kind: 'step' as const,
                    axis: 'right' as const,
                    unit: 'money' as const,
                    tone: 'muted' as const,
                    values: points.map((p) => p.flows),
                  },
                ]
              : []),
          ]
        : [],
    [points, moved],
  );
  if (!data || !page || !fmt) return <Loading k="balance" />;
  // A balance is an amount of money: it has no value in R, ticks, pips or points.
  if (isTradeUnit(display.unit))
    return <Card k="balance" state="empty" empty={noBalanceIn(display.unit)} />;
  if (data.startingBalance === 0)
    return <Card k="balance" state="empty" empty={STARTING_BALANCE_PROMPT} />;
  if (!points || points.length === 0)
    return <Card k="balance" state="empty" empty={NONE} />;
  const last = points[points.length - 1]!;
  return (
    <Card k="balance">
      <div className="mt-3">
        <DualAxisChart
          label={`Account balance by day, ${page.caption}. Ends at ${fmt.text('balance', last.balance)}.${moved ? ` Net deposits and withdrawals ${fmt.text('money', last.flows)}.` : ''}`}
          currency={page.currency}
          xs={xs}
          xHeading="Day"
          pointLabel={(i) => periodText(dates[i]!)}
          xAxis={xAxis}
          series={series}
        />
      </div>
    </Card>
  );
}

export const CHART_RENDER = {
  'cum-pnl': CumPnl,
  'daily-pnl': DailyPnl,
  'daily-cum': DailyCum,
  drawdown: Drawdown,
  'win-avg': WinAvg,
  balance: Balance,
} satisfies Partial<Record<WidgetKey, WidgetRender>>;
