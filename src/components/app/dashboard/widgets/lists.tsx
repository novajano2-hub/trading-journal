'use client';

import { SlidersHorizontal } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { Popover } from 'radix-ui';
import { useId, useMemo, useState } from 'react';
import { MenuSelect } from '@/components/ui/menu-select';
import { recentAndOpen } from '@/data/dashboard';
import { metricContextOf } from '@/data/metrics';
import {
  useAccounts,
  useCashFlows,
  useChallenges,
  useJournal,
  usePrefs,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
} from '@/data/query/hooks';
import { WIDGET_TITLES } from '@/content/dashboard-widgets';
import { WIDGETS } from '@/domain/dashboard/widgets';
import { loggedDates } from '@/domain/metrics/days';
import { SERIES_META, seriesUnit, timeSeries } from '@/domain/metrics/series';
import type { SeriesMetric } from '@/domain/metrics/series';
import { checkChallenge, shownChallenge } from '@/domain/prop/challenge';
import { localDate } from '@/domain/time';
import type { Trade, WidgetKey, WidgetSettings } from '@/domain/types';
import { FigureSourceContext } from '@/lib/display';
import { plural } from '@/lib/format';
import { useAddressCopy } from '@/lib/use-address-copy';
import {
  challengeChip,
  ChallengeCompact,
  phaseLabel,
  shownPhase,
  StatusChip,
} from '../../prop/challenge-card';
import {
  formatPicks,
  MAX_METRICS,
  modeOf,
  parsePicks,
  type Pick,
} from '../../reports/metric-chips';
import {
  align,
  GAP_REASONS,
  METRIC_POPOVER,
  MetricCatalogue,
  PlottedMetrics,
  seriesLabel,
} from '../../reports/metric-picker';
import { periodText, ReportChart } from '../../reports/report-chart';
import type { ChartSeries } from '../../reports/report-chart';
import { RecentTrades } from '../recent-trades';
import { useChartEnv } from './charts';
import { useWidgetCtx, useWidgetValue } from './context';
import { WidgetFrame } from './frame';
import type { WidgetRender } from './registry';
import { useSetWidgetSetting } from './use-widget-setting';

/**
 * The list widgets (#46): the recent and open trades, the challenge and the
 * report. Each draws its frame (`WidgetFrame`: the title, the metric's info
 * tip, the loading and no-data states) around a body the rest of the app
 * already has, and reads money through `useDisplay()` (the bodies do), so the
 * unit and Privacy apply to every figure, label and tip.
 */

const Loading = ({ k }: { k: WidgetKey }) => (
  <WidgetFrame
    widgetKey={k}
    title={WIDGET_TITLES[k]}
    tip={WIDGETS[k].metric}
    state="loading"
  />
);

/** The newest closed trades in the filters, and the open positions on a tab beside them. */
export function Recent(): React.JSX.Element {
  const trades = useWidgetValue('recent');
  const ctx = useWidgetCtx();
  const prefs = usePrefs().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const [chosen, setChosen] = useState<'closed' | 'open'>();
  const model = useMemo(
    () =>
      trades && ctx && strategies && tags && categories
        ? recentAndOpen(trades, {
            strategies,
            tags,
            tagCategories: categories,
            ctx,
          })
        : undefined,
    [trades, ctx, strategies, tags, categories],
  );
  if (!model || !ctx || !prefs) return <Loading k="recent" />;
  const { recent, open } = model;
  // The tab is kept here, so a filter change does not reset it; with no closed trade the open ones show first.
  const tab =
    chosen ?? (recent.length === 0 && open.length > 0 ? 'open' : 'closed');
  return (
    <WidgetFrame
      widgetKey="recent"
      title={WIDGET_TITLES.recent}
      tip={WIDGETS.recent.metric}
      state={recent.length === 0 && open.length === 0 ? 'empty' : 'ready'}
      empty="No trades in this range."
    >
      <RecentTrades
        recent={recent}
        open={open}
        tab={tab}
        onTab={setChosen}
        basis={ctx.pnlBasis}
        timeZone={prefs.timeZone}
      />
    </WidgetFrame>
  );
}

const NO_TRADES: ReadonlyMap<string, Trade> = new Map();

/** The look of the settings control in a frame: quiet, as the report's Metrics button. */
const SETTING_TRIGGER =
  'inline-flex h-7 max-w-[10rem] min-w-0 cursor-pointer items-center gap-1.5 rounded-control px-2 text-[12.5px] font-medium text-muted transition-colors duration-200 ease-(--ease-glide) hover:bg-sunken hover:text-text data-[state=open]:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:px-3';

/**
 * One challenge as its card reads on the Prop firms page, compactly (C11): the
 * one the widget's settings name, else the most urgent active one. A control
 * in the frame picks which; "Most urgent" goes back to the default.
 */
export function Challenge({
  settings,
}: {
  settings?: WidgetSettings;
}): React.JSX.Element {
  const challenges = useChallenges().data;
  const accounts = useAccounts().data;
  const trades = useTrades().data;
  const flows = useCashFlows().data;
  const prefs = usePrefs().data;
  const setSetting = useSetWidgetSetting('challenge');
  const rows = useMemo(() => {
    if (!challenges || !accounts || !trades || !flows || !prefs)
      return undefined;
    const ctx = metricContextOf(prefs);
    const today = localDate(new Date().toISOString(), prefs.timeZone);
    return challenges.map((c) => ({
      c,
      check: checkChallenge(c, accounts, trades, ctx, today, flows),
      ctx,
    }));
  }, [challenges, accounts, trades, flows, prefs]);
  if (!rows) return <Loading k="challenge" />;
  const shown = shownChallenge(rows, settings?.challengeId);
  if (!shown)
    return (
      <WidgetFrame
        widgetKey="challenge"
        title={WIDGET_TITLES.challenge}
        tip={WIDGETS.challenge.metric}
        state="empty"
        empty={
          <span>
            No challenge yet. Add one on the Prop firms page.{' '}
            <Link
              href="/app/prop-firms"
              className="font-semibold text-accent-ink hover:underline"
            >
              Open Prop firms
            </Link>
          </span>
        }
      />
    );
  const { c, check, ctx } = shown;
  const phase = shownPhase(c, check);
  const named = rows.some((r) => r.c.id === settings?.challengeId)
    ? settings!.challengeId!
    : '';
  return (
    <WidgetFrame
      widgetKey="challenge"
      title={c.name}
      tip={WIDGETS.challenge.metric}
      caption={`${c.firm}, ${phase ? phaseLabel(c, phase.step) : 'Evaluation'}`}
      end={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusChip kind={challengeChip(c, check)} />
          <MenuSelect
            label="Challenge shown"
            value={named}
            onChange={(id) =>
              setSetting({ challengeId: id === '' ? undefined : id })
            }
            options={[
              { value: '', label: 'Most urgent' },
              ...rows.map((r) => ({ value: r.c.id, label: r.c.name })),
            ]}
            align="end"
            triggerClassName={SETTING_TRIGGER}
          />
        </span>
      }
    >
      {/* Percentages read against the phase's own starting balance, as on the Prop firms page. */}
      <FigureSourceContext.Provider
        value={{
          tradesById: NO_TRADES,
          ctx,
          pctBase: phase?.account?.startingBalance ?? null,
        }}
      >
        <ChallengeCompact challenge={c} check={check} />
      </FigureSourceContext.Provider>
    </WidgetFrame>
  );
}

/**
 * What the report plots until the template says otherwise: the comp's three,
 * each running from the start of the date range (C10).
 */
const DEFAULT_PICKS: readonly Pick[] = [
  { metric: 'net', kind: 'line', mode: 'running' },
  { metric: 'profit-factor', kind: 'line', mode: 'running' },
  { metric: 'win-rate', kind: 'line', mode: 'running' },
];

/** The metrics as the template stores them: one entry each, in Performance's `?m=` form (`net:line:running`). */
const stored = (picks: readonly Pick[]): string[] =>
  picks.map((p) => formatPicks([p]));

/**
 * The picks a widget's settings hold: none saved is the default three, an
 * empty list is none, an id this build does not know is dropped and no more
 * than three count.
 */
function picksOf(settings: WidgetSettings | undefined): Pick[] {
  const saved = settings?.metrics;
  return parsePicks(
    saved === undefined ? null : saved.join(','),
    DEFAULT_PICKS,
  );
}

/** Why a period can have no value for a plotted metric. */
const gapNote = (label: string, metric: SeriesMetric) =>
  `${label} ${GAP_REASONS[metric] ?? 'has no value in some periods.'}`;

/**
 * The Metrics menu: the metrics plotted, each with its bars or line and its
 * value per day or running, and the catalogue to add to them from. Three at
 * most; once there are three the others are disabled and say why.
 */
function MetricsMenu({
  picks,
  basis,
  save,
}: {
  picks: readonly Pick[];
  basis: 'net' | 'gross';
  save(next: Pick[]): void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const limitId = useId();
  const full = picks.length >= MAX_METRICS;
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-control px-2 text-[12.5px] font-medium text-muted transition-colors duration-200 ease-(--ease-glide) hover:bg-sunken hover:text-text data-[state=open]:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:px-3">
        <SlidersHorizontal
          size={15}
          aria-hidden="true"
          className="text-faint"
        />
        Metrics
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          aria-label="Choose metrics"
          className={METRIC_POPOVER}
        >
          <div className="flex-none px-3 pb-3">
            {picks.length > 0 ? (
              <PlottedMetrics
                picks={picks}
                basis={basis}
                onChange={(pick, to) =>
                  save(picks.map((x) => (x === pick ? { ...x, ...to } : x)))
                }
                onRemove={(metric) =>
                  save(picks.filter((x) => x.metric !== metric))
                }
              />
            ) : null}
            <p id={limitId} className="mt-2.5 text-[12.5px] text-muted">
              {full
                ? 'Three metrics at most. Remove one to add another.'
                : 'Up to three metrics.'}
            </p>
          </div>
          <MetricCatalogue
            picks={picks}
            basis={basis}
            query={query}
            onQuery={setQuery}
            limitId={limitId}
            onToggle={(metric, on) =>
              save(
                on
                  ? [
                      ...picks,
                      {
                        metric,
                        kind: SERIES_META[metric].kind,
                        mode: 'period',
                      },
                    ]
                  : picks.filter((x) => x.metric !== metric),
              )
            }
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * One chart of up to three metrics from the Performance catalogue, by day (C10):
 * the Performance chart slot's body, with the choice kept on the widget. Each
 * metric is bars or a line, per day or running from the start of the range.
 */
export function Report({
  settings,
}: {
  settings?: WidgetSettings;
}): React.JSX.Element {
  const data = useWidgetValue('report');
  const { page, ctx, basis, fmt } = useChartEnv();
  const setSetting = useSetWidgetSetting('report');
  // The picks change at once and follow the stored template when it catches up, so a second click
  // before the save lands builds on the first (the pattern Performance's slots use for the address).
  const [picks, setPicks] = useAddressCopy(
    picksOf(settings),
    JSON.stringify(settings?.metrics ?? null),
  );
  // The journal is read only while Logged days is plotted.
  const wantsLogged = picks.some((x) => x.metric === 'logged-days');
  const entries = useJournal({ enabled: wantsLogged }).data;
  const noted = useMemo(
    () => (wantsLogged && entries ? loggedDates(entries) : undefined),
    [wantsLogged, entries],
  );
  const { keys, aligned } = useMemo(
    () =>
      data && ctx
        ? align(
            picks.map((x) =>
              timeSeries(data.dayTrades, ctx, x.metric, 'day', {
                mode: modeOf(x),
                balance: { start: data.riskStart, flows: data.riskFlows },
                ...(noted ? { loggedDates: noted } : {}),
              }),
            ),
          )
        : { keys: [], aligned: [] },
    [data, ctx, picks, noted],
  );
  if (!data || !page || !ctx || !fmt) return <Loading k="report" />;

  const series: ChartSeries[] = picks.map((x, i) => ({
    label: seriesLabel(x, basis),
    kind: x.kind,
    unit: seriesUnit(x.metric, ctx),
    points: aligned[i]!,
  }));
  const save = (next: Pick[]) => {
    setPicks(next);
    setSetting({ metrics: stored(next) });
  };
  const caption = `By day, ${picks.length} ${plural(picks.length, 'metric')}`;
  const end = <MetricsMenu picks={picks} basis={basis} save={save} />;
  const frame = {
    widgetKey: 'report',
    title: WIDGET_TITLES.report,
    tip: WIDGETS.report.metric,
    caption,
    end,
  } as const;
  if (picks.length === 0)
    return (
      <WidgetFrame
        {...frame}
        state="empty"
        empty="Pick a metric to chart it."
      />
    );
  if (keys.length === 0)
    return (
      <WidgetFrame
        {...frame}
        state="empty"
        empty="No closed trades in this range."
      />
    );

  const gaps = series.flatMap((x, i) =>
    x.points.some((pt) => pt.value === null)
      ? [gapNote(x.label, picks[i]!.metric)]
      : [],
  );
  const bare = series.every((x) => x.points.every((pt) => pt.value === null));
  /** Where each metric runs, so the label carries values as well as names. */
  const ranges = series
    .map((x) => {
      const vs = x.points.flatMap((pt) =>
        pt.value === null ? [] : [pt.value],
      );
      if (vs.length === 0) return '';
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      return lo === hi
        ? ` ${x.label} is ${fmt.text(x.unit, lo)}.`
        : ` ${x.label} runs from ${fmt.text(x.unit, lo)} to ${fmt.text(x.unit, hi)}.`;
    })
    .join('');
  return (
    <WidgetFrame {...frame}>
      <div className="mt-3">
        {bare ? (
          <p
            role="status"
            className="flex min-h-40 items-center justify-center py-10 text-center text-[13.5px] text-faint"
          >
            {gaps.join(' ')}
          </p>
        ) : (
          <>
            <ReportChart
              label={`${series.map((x) => x.label).join(', ')} by day, ${page.caption}.${ranges}`}
              series={series}
              periodLabel={periodText}
              currency={page.currency}
              height={series.length === 1 ? 190 : 100}
              expandSlot={null}
            />
            {gaps.length > 0 ? (
              <p className="mt-2 text-[12.5px] text-faint">{gaps.join(' ')}</p>
            ) : null}
          </>
        )}
      </div>
    </WidgetFrame>
  );
}

export const LIST_RENDER = {
  recent: Recent,
  challenge: Challenge,
  report: Report,
} satisfies Partial<Record<WidgetKey, WidgetRender>>;
