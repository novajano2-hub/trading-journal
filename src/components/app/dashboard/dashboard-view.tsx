'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Segmented } from '@/components/ui/segmented';
import { buildDashboard, openPositions, pickPartition } from '@/data/dashboard';
import { EMPTY_FILTERS, resolveRange } from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import {
  useGlobalFilters,
  useMetrics,
  useTradeSet,
} from '@/data/query/derived';
import {
  useAccounts,
  useCashFlows,
  useImportHistory,
  useUserAccounts,
  useActiveWorkspace,
  usePrefs,
  useSetActiveWorkspace,
  useStrategies,
  useTagCategories,
  useTags,
  useTrades,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { dailyPnl } from '@/domain/metrics/days';
import { isTradeUnit } from '@/domain/metrics/units';
import { localDate } from '@/domain/time';
import {
  expectancyFigure,
  expectancyInUnit,
  FigureSourceContext,
  pctBaseOf,
  shownUnit,
  type FigureSource,
} from '@/lib/display';
import { rangeCaption } from '@/lib/range-label';
import { shortTime } from '@/lib/time-format';
import type { Account, ImportJob } from '@/domain/types';
import { hasActiveFilters, switchWorkspaceFilters } from '../filter-model';
import { Drilldown } from './drilldown';
import { MistakesCard } from './mistakes-card';
import {
  equityLine,
  kpiTrends,
  NO_TRENDS,
  PerformanceCard,
} from './performance-card';
import { PlanCard } from './plan-card';
import { ProgressCard } from './progress-card';
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
 * One quiet line: when the latest import that is not undone ran, and into
 * which account, with a link to Import history. Absent with no such import.
 */
function LastImport({
  jobs,
  accounts,
  timeZone,
}: {
  jobs: readonly ImportJob[] | undefined;
  accounts: readonly Account[] | undefined;
  timeZone: string;
}): React.JSX.Element | null {
  const latest = (jobs ?? [])
    .filter((j) => j.status === 'active')
    .reduce<ImportJob | undefined>(
      (a, j) =>
        a === undefined || Date.parse(j.createdAt) > Date.parse(a.createdAt)
          ? j
          : a,
      undefined,
    );
  // Held until the account name is known, so the line never changes under the eye.
  if (!latest || accounts === undefined) return null;
  const account = accounts?.find((a) => a.id === latest.accountId);
  return (
    <p className="text-[13px] text-muted">
      <span>
        Last import{' '}
        <span className="tabular-nums">
          {shortTime(latest.createdAt, timeZone)}
        </span>
        {account ? ` into ${account.name}` : ''}.
      </span>{' '}
      <Link
        href="/app/settings/import-history"
        className="rounded-chip font-semibold text-accent-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Import history
      </Link>
    </p>
  );
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
  const flows = useCashFlows().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const categories = useTagCategories().data;
  const setActive = useSetActiveWorkspace();
  const queryClient = useQueryClient();
  const imports = useImportHistory().data;
  const userAccounts = useUserAccounts().data;

  const [currency, setCurrency] = useState<string>();
  // Chosen here, not in the card: a filter change remounts the card. Until chosen, whichever list has rows.
  const [recentTab, setRecentTab] = useState<'closed' | 'open'>();
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
      !flows ||
      !allTrades ||
      today === undefined
    )
      return undefined;
    const withClosed = metrics.data.filter((m) => m.summary.closedCount > 0);
    const range = resolveRange(shownFilters.range, today, prefs.weekStart);
    const caption = rangeCaption(range, today);
    if (withClosed.length === 0)
      return {
        withClosed,
        caption,
        model: undefined,
        trends: NO_TRENDS,
        line: undefined,
        source: undefined,
      };
    const chosen = withClosed.some((m) => m.currency === currency)
      ? currency
      : undefined;
    const partition = pickPartition(metrics.data, chosen, prefs.baseCurrency);
    const ctx = { ...metricContextOf(prefs), range };
    const model = buildDashboard(partition, {
      strategies,
      tags,
      tagCategories: categories,
      ctx,
    });
    // What the display units divide by, and the trades behind each figure.
    const pctBase = pctBaseOf({
      accounts,
      flows,
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
    const trendUnit = shownUnit(
      expectancyFigure(
        partition.trades,
        ctx,
        pctBase,
        model.performance.expectancy ?? 0,
      ),
      prefs.displayUnit,
    );
    const trends = kpiTrends(
      partition.trades,
      ctx,
      trendUnit === 'dollar' || trendUnit === 'privacy'
        ? undefined
        : (window, s) =>
            expectancyInUnit(window, s.expectancy, trendUnit, ctx, pctBase),
    );
    // The partition's days are on the basis its equity is, so the last close is the last balance.
    // Its days come from the same trades as the equity, so the last close is the last balance.
    const line = equityLine(
      model.performance.equity,
      dailyPnl(partition.trades, metricContextOf(prefs)),
    );
    return {
      withClosed,
      caption,
      model,
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
    flows,
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
    // Every account archived and none picked: the trades are there, out of view (E57).
    const allArchived =
      accounts !== undefined &&
      accounts.length > 0 &&
      accounts.every((a) => a.status === 'archived') &&
      shownFilters.accountIds.length === 0;
    // The display unit left out every closed trade: say so, not "none yet".
    const unit = prefs?.displayUnit;
    const narrowed =
      (set.data?.unitLeftOut ?? 0) > 0 && isTradeUnit(unit) ? unit : undefined;
    const variant =
      allTrades.length === 0
        ? 'no-trades'
        : allArchived
          ? 'archived'
          : narrowed
            ? 'unit'
            : filtered && set.data?.trades.length === 0
              ? 'no-matches'
              : 'no-closed';
    // Open trades but no closed one: the empty state, and the open positions beneath it.
    const openOnly =
      variant === 'no-closed' && set.data
        ? openPositions(set.data.trades, metricContextOf(prefs!))
        : [];
    const empty = (
      <DashboardEmpty
        variant={variant}
        filtered={filtered}
        unit={narrowed}
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
    if (openOnly.length === 0) return empty;
    return (
      <FigureSourceContext.Provider value={null}>
        {empty}
        <div className="px-5 pb-5">
          <RecentTrades
            recent={[]}
            open={openOnly}
            tab={recentTab ?? 'open'}
            onTab={setRecentTab}
            basis={prefs?.pnlBasis ?? 'net'}
            timeZone={timeZone}
            caption={view.caption}
          />
        </div>
      </FigureSourceContext.Provider>
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
        <LastImport
          jobs={imports}
          accounts={userAccounts}
          timeZone={timeZone}
        />
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
        {/*
          Row 2. From xl, Mistakes and the progress tracker stack in one column beside
          Performance, whose line takes the height they make together, so no
          card has a tail of empty space. Between md and xl the two sit side
          by side with Performance across both; on a phone, one column.
        */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.75fr)]">
          <div className="contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4">
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
            <ProgressCard />
          </div>
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
          open={m.open}
          tab={
            recentTab ??
            (m.recent.length === 0 && m.open.length > 0 ? 'open' : 'closed')
          }
          onTab={setRecentTab}
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
