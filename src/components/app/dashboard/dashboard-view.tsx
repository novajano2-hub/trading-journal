'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/segmented';
import { buildDashboard, pickPartition } from '@/data/dashboard';
import { EMPTY_FILTERS, resolveRange } from '@/data/filters';
import { goalsFor, withGoals } from '@/data/goals';
import { metricContextOf } from '@/data/metrics';
import {
  useGlobalFilters,
  useMetrics,
  useTradeSet,
} from '@/data/query/derived';
import {
  useAccounts,
  useActiveWorkspace,
  usePrefs,
  useSetActiveWorkspace,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
  useUpdatePrefs,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { dailyPnl, type DayStat } from '@/domain/metrics/days';
import { goalWeek } from '@/domain/metrics/goals';
import { localDate } from '@/domain/time';
import {
  FigureSourceContext,
  meanFigure,
  meanInUnit,
  pctBaseOf,
  shownUnit,
  tradeFigure,
  type FigureSource,
} from '@/lib/display';
import { closedInOrder } from '@/domain/trade-status';
import { rangeCaption } from '@/lib/range-label';
import { hasActiveFilters, switchWorkspaceFilters } from '../filter-model';
import { Drilldown } from './drilldown';
import { GoalsCard } from './goals-card';
import { MistakesCard } from './mistakes-card';
import {
  equityLine,
  kpiTrends,
  NO_TRENDS,
  PerformanceCard,
} from './performance-card';
import { PlanCard } from './plan-card';
import { RecentTrades } from './recent-trades';
import { DashboardEmpty, DashboardError, DashboardSkeleton } from './states';

export type DrillTarget =
  { kind: 'rule'; ruleId: string } | { kind: 'mistake'; tagId: string };

interface Drill {
  target: DrillTarget;
  /** The trades behind the number at the moment it was opened. */
  tradeIds: string[];
  open: boolean;
}

/**
 * Where a drill-down grows from and hands focus back to. Read when the dialog
 * opens and closes, not when it renders: a regrade can remove the opener (a
 * rule never broken any more is not a button), and focus then goes to the
 * table or list it was in.
 */
function useDrillAnchors() {
  const [anchors] = useState(() => {
    let opener: HTMLElement | null = null;
    let row: HTMLElement | null = null;
    let fallback: () => HTMLElement | null = () => null;
    const live = (el: HTMLElement | null) => (el?.isConnected ? el : null);
    return {
      set(next: {
        opener: HTMLElement;
        row: HTMLElement | null;
        fallback: () => HTMLElement | null;
      }) {
        opener = next.opener;
        row = next.row;
        fallback = next.fallback;
      },
      origin: {
        get current() {
          return live(row);
        },
      },
      returnFocus: {
        get current() {
          return live(opener) ?? fallback();
        },
      },
    };
  });
  return anchors;
}

/**
 * The "Plan vs actual" Dashboard on the URL's filters. Render inside
 * `<Suspense>`: it reads the search params.
 */
export function DashboardView(): React.JSX.Element {
  const { filters, setFilters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const metrics = useMetrics(filters);
  const prefs = usePrefs().data;
  const workspace = useActiveWorkspace();
  const allTrades = useTrades().data;
  const accounts = useAccounts().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const setActive = useSetActiveWorkspace();
  const updatePrefs = useUpdatePrefs();
  const queryClient = useQueryClient();

  const [currency, setCurrency] = useState<string>();
  const [drill, setDrill] = useState<Drill | null>(null);
  const anchors = useDrillAnchors();
  const planRegion = useRef<HTMLElement>(null);
  const rulesTable = useRef<HTMLTableElement>(null);
  const mistakesList = useRef<HTMLUListElement>(null);
  // After "Clear filters" or "Open the sample workspace" the button is gone: focus the plan that replaces it.
  const focusOnReady = useRef(false);

  const timeZone = prefs?.timeZone;
  const today =
    timeZone === undefined
      ? undefined
      : localDate(new Date().toISOString(), timeZone);
  const shownFilters = set.data?.filters;

  const view = useMemo(() => {
    if (
      !metrics.data ||
      !shownFilters ||
      !prefs ||
      !workspace.data ||
      !strategies ||
      !tags ||
      !categories ||
      !accounts ||
      !allTrades ||
      today === undefined
    )
      return undefined;
    const withClosed = metrics.data.filter((m) => m.summary.closedCount > 0);
    const range = resolveRange(shownFilters.range, today);
    const caption = rangeCaption(range, today);
    const goals = goalsFor(prefs, workspace.data);
    if (withClosed.length === 0)
      return {
        withClosed,
        caption,
        goals,
        model: undefined,
        weekLabel: '',
        days: [] as DayStat[],
        trends: NO_TRENDS,
        line: undefined,
        source: undefined,
      };
    const chosen = withClosed.some((m) => m.currency === currency)
      ? currency
      : undefined;
    const partition = pickPartition(metrics.data, chosen, prefs.baseCurrency);
    // Day figures (the loss-limit grid, goals) take the exits dated in the range.
    const ctx = { ...metricContextOf(prefs), range };
    const model = buildDashboard(partition, {
      strategies,
      tags,
      tagCategories: categories,
      goals,
      baseCurrency: prefs.baseCurrency,
      ctx,
      range,
      today,
    });
    // The daily loss limit's grid: every trading day, always on net, as the goal reads them.
    const days = !model.goals.dailyLoss
      ? []
      : partition.summary.basis === 'net'
        ? partition.days
        : dailyPnl(partition.trades, { ...ctx, pnlBasis: 'net' });
    // What the display units divide by, and the trades behind each figure.
    const pctBase = pctBaseOf({
      accounts,
      trades: allTrades,
      accountIds: shownFilters.accountIds,
      currency: partition.currency,
      from: range.from,
      timeZone: prefs.timeZone,
    });
    const source: FigureSource = {
      tradesById: model.tradesById,
      ctx,
      pctBase,
    };
    // A KPI trend reads in the unit its figure does; dollars and Privacy keep the summary's own.
    const closed = closedInOrder(partition.trades);
    const mean = meanFigure(
      closed.map((t) => tradeFigure(t, ctx)),
      pctBase,
    );
    const trendUnit = shownUnit(mean, prefs.displayUnit);
    const trends = kpiTrends(
      partition.trades,
      ctx,
      trendUnit === 'dollar' || trendUnit === 'privacy'
        ? undefined
        : (window) => meanInUnit(window, trendUnit, ctx, pctBase),
    );
    // The partition's days are on the basis its equity is, so the last close is the last balance.
    const line = equityLine(model.performance.equity, partition.days);
    // "this week" while the goal week is today's; a range that ended earlier reads "that week".
    const week = model.goals.weekly?.window;
    const weekLabel = week
      ? `${week.from >= goalWeek({}, today)!.from ? 'this' : 'that'} week, ${rangeCaption(week, today)}`
      : '';
    return {
      withClosed,
      caption,
      goals,
      model,
      weekLabel,
      days,
      trends,
      line,
      source,
    };
  }, [
    metrics.data,
    shownFilters,
    prefs,
    workspace.data,
    strategies,
    tags,
    categories,
    accounts,
    allTrades,
    today,
    currency,
  ]);

  const model = view?.model;
  useEffect(() => {
    if (model && focusOnReady.current) {
      focusOnReady.current = false;
      planRegion.current?.focus();
    }
  }, [model]);

  const error = workspace.error ?? set.error ?? metrics.error;
  if (error) {
    return (
      <DashboardError
        error={error}
        onRetry={() => {
          // A stalled open never recovers in place; a fresh page opens storage again.
          if (error instanceof StorageUnavailableError)
            window.location.reload();
          else void queryClient.resetQueries({ queryKey: ['keel'] });
        }}
      />
    );
  }
  if (!view || !allTrades || !shownFilters || timeZone === undefined)
    return <DashboardSkeleton />;

  if (allTrades.length === 0 || !view.model) {
    const filtered = hasActiveFilters(shownFilters);
    // No matches only when the filters leave no trade at all; open trades in them are "no closed".
    const variant =
      allTrades.length === 0
        ? 'no-trades'
        : filtered && set.data?.trades.length === 0
          ? 'no-matches'
          : 'no-closed';
    return (
      <DashboardEmpty
        variant={variant}
        filtered={filtered}
        onClearFilters={() => {
          focusOnReady.current = true;
          setFilters(EMPTY_FILTERS);
        }}
        onOpenSample={() => {
          focusOnReady.current = true;
          // Ids never cross workspaces: drop the account, strategy and tag filters.
          setActive.mutateAsync(SAMPLE_WORKSPACE.id).then(
            () => setFilters(switchWorkspaceFilters(filters)),
            () => {
              focusOnReady.current = false;
            },
          );
        }}
      />
    );
  }

  const m = view.model;
  const caption = view.caption;
  const open = (target: DrillTarget, opener: HTMLElement) => {
    const tradeIds =
      target.kind === 'rule'
        ? (m.plan.rules.find((r) => r.ruleId === target.ruleId)
            ?.brokenTradeIds ?? [])
        : (m.mistakes.find((x) => x.tagId === target.tagId)?.tradeIds ?? []);
    anchors.set(
      target.kind === 'rule'
        ? {
            opener,
            row: opener.closest('tr'),
            fallback: () => rulesTable.current,
          }
        : { opener, row: opener, fallback: () => mistakesList.current },
    );
    setDrill({ target, tradeIds: [...tradeIds], open: true });
  };

  return (
    <FigureSourceContext.Provider value={view.source ?? null}>
      <div
        data-testid="dashboard-ready"
        className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0"
      >
        {view.withClosed.length > 1 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Segmented
              label="Currency"
              options={view.withClosed.map((c) => ({
                value: c.currency,
                label: c.currency,
              }))}
              value={m.currency}
              onChange={setCurrency}
              coarseTargets
            />
            <p className="text-[13px] text-muted">
              Each currency is shown on its own. Converting between them
              isn&apos;t built yet.
            </p>
          </div>
        ) : null}
        <PlanCard
          plan={m.plan}
          basis={m.basis}
          currency={m.currency}
          caption={caption}
          tableRef={rulesTable}
          regionRef={planRegion}
          onOpenRule={(ruleId, button) =>
            open({ kind: 'rule', ruleId }, button)
          }
        />
        {/* Row 2: three cards from xl, Performance the widest; between md and xl two, then Performance across both. */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)_minmax(0,1.38fr)]">
          <MistakesCard
            mistakes={m.mistakes}
            basis={m.basis}
            currency={m.currency}
            caption={caption}
            listRef={mistakesList}
            onOpenMistake={(tagId, button) =>
              open({ kind: 'mistake', tagId }, button)
            }
          />
          <GoalsCard
            // A workspace switch drops a half-edited form.
            key={workspace.data?.id}
            goals={m.goals}
            days={view.days}
            set={view.goals}
            currency={prefs?.baseCurrency ?? m.currency}
            weekLabel={view.weekLabel}
            rangeLabel={caption}
            onSave={async (next) => {
              const ws = workspace.data;
              if (!ws) throw new Error('No active workspace');
              await updatePrefs.mutateAsync(withGoals(ws.id, next));
            }}
          />
          <div className="min-w-0 md:max-xl:col-span-2">
            <PerformanceCard
              performance={m.performance}
              line={view.line}
              trends={view.trends}
              basis={m.basis}
              currency={m.currency}
            />
          </div>
        </div>
        <RecentTrades
          recent={m.recent}
          basis={m.basis}
          timeZone={timeZone}
          caption={caption}
        />
        {drill ? (
          <Drilldown
            target={drill.target}
            tradeIds={drill.tradeIds}
            open={drill.open}
            onOpenChange={(next) =>
              setDrill((d) => (d ? { ...d, open: next } : d))
            }
            origin={anchors.origin}
            returnFocus={anchors.returnFocus}
            model={m}
            caption={caption}
            timeZone={timeZone}
            trades={allTrades}
            strategies={strategies ?? []}
            tags={tags ?? []}
            categories={categories ?? []}
          />
        ) : null}
      </div>
    </FigureSourceContext.Provider>
  );
}
