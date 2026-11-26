'use client';

import { addDays, format, parseISO } from 'date-fns';
import { useContext, useMemo } from 'react';
import { dateTicks } from '@/components/charts/chart-kit';
import {
  DualAxisChart,
  type DualSeries,
} from '@/components/charts/dual-axis-chart';
import {
  ScatterChart,
  type DotReadout,
  type ScatterDot,
} from '@/components/charts/scatter-chart';
import { FigureText } from '@/components/product/figure-text';
import { Segmented } from '@/components/ui/segmented';
import { UNIT_SCOPE } from '@/content/display-units';
import {
  formatterOf,
  periodText,
  ReportChart,
} from '@/components/app/reports/report-chart';
import { usePrefs } from '@/data/query/hooks';
import type { MetricContext } from '@/domain/metrics/context';
import { dayValue, type DayStat } from '@/domain/metrics/days';
import { clockText, durationAxis, timeAxis } from '@/domain/metrics/scatter';
import {
  seriesUnit,
  type SeriesPoint,
  type SeriesUnit,
} from '@/domain/metrics/series';
import { isTradeUnit } from '@/domain/metrics/units';
import { isClosed } from '@/domain/trade-status';
import type { WidgetKey, WidgetSettings } from '@/domain/types';
import { FigureSourceContext, useDisplay } from '@/lib/display';
import {
  formatCount,
  formatDuration,
  formatInstrument,
  formatMinutes,
  plural,
} from '@/lib/format';
import { shortTime } from '@/lib/time-format';
import { zoneLabel } from '@/lib/time-zone-label';
import { noBalanceIn, STARTING_BALANCE_PROMPT } from './balance-states';
import { useWidgetCtx, useWidgetPage, useWidgetValue } from './context';
import { WidgetCard, WidgetLoading } from './frame';
import type { WidgetRender } from './registry';
import { sentenceCase } from './text';
import { useSetWidgetSetting } from './use-widget-setting';

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
 * The running total with its zero in front, on the day before the range starts
 * (before the first trading day, when the range has no start). A single trading
 * day then draws two points, as TradeZella's chart does (record 1.5).
 */
function fromZero(
  running: readonly SeriesPoint[],
  from: string | undefined,
): SeriesPoint[] {
  const first = running[0];
  if (!first) return [];
  const before = format(addDays(parseISO(from ?? first.key), -1), 'yyyy-MM-dd');
  return [{ key: before, value: 0 }, ...running];
}

/** What every chart widget reads besides its own series. */
export function useChartEnv() {
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
    () =>
      days && ctx
        ? fromZero(dayPoints(days, ctx).running, ctx.range?.from)
        : undefined,
    [days, ctx],
  );
  if (!days || !page || !ctx || !fmt || !points)
    return <WidgetLoading k="cum-pnl" />;
  const caption = sentenceCase('by trading day');
  if (days.length === 0)
    return (
      <WidgetCard k="cum-pnl" state="empty" empty={NONE} caption={caption} />
    );
  const unit = seriesUnit('cumulative-net', ctx);
  const ends = points[points.length - 1]!.value!;
  return (
    <WidgetCard k="cum-pnl" caption={caption}>
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
    </WidgetCard>
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
    return <WidgetLoading k="daily-pnl" />;
  const caption = sentenceCase('by trading day');
  if (days.length === 0)
    return (
      <WidgetCard k="daily-pnl" state="empty" empty={NONE} caption={caption} />
    );
  const unit = seriesUnit('net', ctx);
  const best = points.reduce((a, p) => (p.value! > a.value! ? p : a));
  const worst = points.reduce((a, p) => (p.value! < a.value! ? p : a));
  return (
    <WidgetCard k="daily-pnl" caption={caption}>
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
    </WidgetCard>
  );
}

/** How far the running net P&L sat under its high, each trading day: the chart, nothing else. */
export function Drawdown(): React.JSX.Element {
  // The widget's series is already the distance under the high, a point a trading day.
  const points = useWidgetValue('drawdown');
  const { page, fmt } = useChartEnv();
  if (!page || !fmt || !points) return <WidgetLoading k="drawdown" />;
  const caption = sentenceCase('by trading day');
  if (points.length === 0)
    return (
      <WidgetCard k="drawdown" state="empty" empty={NONE} caption={caption} />
    );
  // One trading day has no fall to draw (record 1.5).
  if (points.length < 2)
    return (
      <WidgetCard
        k="drawdown"
        state="empty"
        empty="Not enough days to draw a drawdown."
        caption={caption}
      />
    );
  // The curve starts at its high, so its lowest point is the max drawdown.
  const deepest = Math.min(0, ...points.map((p) => p.value));
  return (
    <WidgetCard k="drawdown" caption={caption}>
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
    </WidgetCard>
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
  if (!days || !page || !ctx || !fmt || !both)
    return <WidgetLoading k="daily-cum" />;
  const caption = sentenceCase('by trading day');
  if (days.length === 0)
    return (
      <WidgetCard k="daily-cum" state="empty" empty={NONE} caption={caption} />
    );
  const ends = both.running[both.running.length - 1]!.value!;
  return (
    <WidgetCard k="daily-cum" caption={caption}>
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
    </WidgetCard>
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
  if (!points || !page || !ctx || !fmt) return <WidgetLoading k="win-avg" />;
  const caption = sentenceCase('through the day');
  if (points.length === 0)
    return (
      <WidgetCard k="win-avg" state="empty" empty={NONE} caption={caption} />
    );
  const last = points[points.length - 1]!;
  const say = (u: SeriesUnit, v: number | null) =>
    v === null ? 'none' : fmt.text(u, v);
  return (
    <WidgetCard k="win-avg" caption={caption}>
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
    </WidgetCard>
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
  if (!data || !page || !fmt) return <WidgetLoading k="balance" />;
  // A balance is an amount of money: it has no value in R, ticks, pips or points.
  if (isTradeUnit(display.unit))
    return (
      <WidgetCard k="balance" state="empty" empty={noBalanceIn(display.unit)} />
    );
  if (data.unfunded)
    return (
      <WidgetCard k="balance" state="empty" empty={STARTING_BALANCE_PROMPT} />
    );
  if (!points || points.length === 0)
    return <WidgetCard k="balance" state="empty" empty={NONE} />;
  const last = points[points.length - 1]!;
  return (
    <WidgetCard k="balance">
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
    </WidgetCard>
  );
}

/**
 * What a scatter's readout says of a trade, and where it leads: the trade's
 * instrument and side, the time read, how long it was held and its P&L (with
 * the unit's own figure under a narrowing unit).
 */
function useDescribe(
  time: 'entry' | 'exit' | 'duration',
): ((id: string) => DotReadout | undefined) | undefined {
  const source = useContext(FigureSourceContext);
  const page = useWidgetPage();
  const display = useDisplay();
  const basis = usePrefs().data?.pnlBasis ?? 'net';
  if (!source || !page) return undefined;
  const { timeZone } = source.ctx;
  const currency = page.currency;
  return (id) => {
    const t = source.tradesById.get(id);
    if (!t || !isClosed(t)) return undefined;
    const held = formatDuration(
      Date.parse(t.closedAt) - Date.parse(t.openedAt),
    );
    const name = formatInstrument(t.instrument, t.openedAt, timeZone).name;
    const pnl = display.ofTrade(t);
    return {
      title: `${name} ${t.direction}`,
      lines: [
        time === 'entry'
          ? { label: 'Entered', value: shortTime(t.openedAt, timeZone) }
          : { label: 'Closed', value: shortTime(t.closedAt, timeZone) },
        { label: 'Held', value: held },
        {
          label: `${sentenceCase(basis)} P&L`,
          value: <FigureText f={display.cash(pnl.money, true, currency)} />,
        },
        ...(isTradeUnit(display.unit)
          ? [
              {
                label: UNIT_SCOPE[display.unit].name,
                value: <FigureText f={display.figure(pnl, true, currency)} />,
              },
            ]
          : []),
      ],
      href: `/app/trades/${encodeURIComponent(id)}`,
    };
  };
}

/** How many of the dots won, lost and broke even, by the sign of the P&L. */
function tally(dots: readonly ScatterDot[]) {
  let won = 0;
  let lost = 0;
  for (const d of dots) {
    if (d.y > 0) won += 1;
    else if (d.y < 0) lost += 1;
  }
  return { won, lost, even: dots.length - won - lost };
}

/** The dots' sentence for a label: how many won and lost, with the best and the worst. */
function describeDots(
  dots: readonly ScatterDot[],
  fmt: ReturnType<typeof formatterOf>,
): string {
  const { won, lost, even } = tally(dots);
  const best = Math.max(...dots.map((d) => d.y));
  const worst = Math.min(...dots.map((d) => d.y));
  return `${won} won (filled dots), ${lost} lost (hollow dots)${even > 0 ? `, ${even} breakeven` : ''}. Best ${fmt.text('money', best)}, worst ${fmt.text('money', worst)}.`;
}

/** Each closed trade by the time of day it was entered or exited, and what it made. */
export function TradeTime({
  settings,
}: {
  settings?: WidgetSettings;
}): React.JSX.Element {
  const data = useWidgetValue('trade-time');
  const { page, ctx, fmt } = useChartEnv();
  const describe = useDescribe(settings?.time ?? 'entry');
  const setSetting = useSetWidgetSetting('trade-time');
  const time = settings?.time ?? 'entry';
  const points = data?.[time];
  const dots = useMemo<ScatterDot[]>(
    () => points?.map((p) => ({ id: p.tradeId, x: p.x, y: p.pnl })) ?? [],
    [points],
  );
  const oneDay =
    ctx?.range?.from !== undefined && ctx.range.from === ctx.range.to;
  const xAxis = useMemo(
    () =>
      timeAxis(
        dots.map((d) => d.x),
        oneDay,
      ),
    [dots, oneDay],
  );
  if (!data || !page || !ctx || !fmt || !describe)
    return <WidgetLoading k="trade-time" />;
  // The switch stays, whatever the range holds: it is the widget's setting.
  const end = (
    <Segmented
      label="Time of"
      options={[
        { value: 'entry', label: 'Entry' },
        { value: 'exit', label: 'Exit' },
      ]}
      value={time}
      onChange={(value) => setSetting({ time: value })}
      coarseTargets
    />
  );
  if (dots.length === 0)
    return <WidgetCard k="trade-time" end={end} state="empty" empty={NONE} />;
  return (
    <WidgetCard k="trade-time" end={end}>
      <div className="mt-3">
        <ScatterChart
          label={`Trade time performance by ${time} time, ${formatCount(dots.length)} closed ${plural(dots.length, 'trade')}, ${page.caption}. ${describeDots(dots, fmt)}`}
          currency={page.currency}
          dots={dots}
          xAxis={xAxis}
          describe={describe}
          note={`Times in ${zoneLabel(ctx.timeZone)}`}
        />
      </div>
    </WidgetCard>
  );
}

/** Each closed trade by how long it was held, on a log scale, and what it made. */
export function TradeDuration(): React.JSX.Element {
  const points = useWidgetValue('trade-duration');
  const { page, ctx, fmt } = useChartEnv();
  const describe = useDescribe('duration');
  const dots = useMemo<ScatterDot[]>(
    () => points?.map((p) => ({ id: p.tradeId, x: p.x, y: p.pnl })) ?? [],
    [points],
  );
  const xAxis = useMemo(() => durationAxis(dots.map((d) => d.x)), [dots]);
  if (!points || !page || !ctx || !fmt || !describe)
    return <WidgetLoading k="trade-duration" />;
  const caption = sentenceCase('log scale');
  if (dots.length === 0)
    return (
      <WidgetCard
        k="trade-duration"
        caption={caption}
        state="empty"
        empty={NONE}
      />
    );
  const xs = dots.map((d) => d.x);
  const spread = `Held from ${formatMinutes(10 ** Math.min(...xs))} to ${formatMinutes(10 ** Math.max(...xs))}.`;
  return (
    <WidgetCard k="trade-duration" caption={caption}>
      <div className="mt-3">
        <ScatterChart
          label={`Trade duration performance, ${formatCount(dots.length)} closed ${plural(dots.length, 'trade')}, ${page.caption}. ${spread} ${describeDots(dots, fmt)}`}
          currency={page.currency}
          dots={dots}
          xAxis={xAxis}
          describe={describe}
        />
      </div>
    </WidgetCard>
  );
}

export const CHART_RENDER = {
  'cum-pnl': CumPnl,
  'daily-pnl': DailyPnl,
  'daily-cum': DailyCum,
  drawdown: Drawdown,
  'win-avg': WinAvg,
  balance: Balance,
  'trade-time': TradeTime,
  'trade-duration': TradeDuration,
} satisfies Partial<Record<WidgetKey, WidgetRender>>;
