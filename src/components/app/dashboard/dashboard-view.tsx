'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/segmented';
import { buildDashboard, pickPartition } from '@/data/dashboard';
import { EMPTY_FILTERS, resolveRange } from '@/data/filters';
import { goalsFor } from '@/data/goals';
import { metricContextOf } from '@/data/metrics';
import {
  useGlobalFilters,
  useMetrics,
  useTradeSet,
} from '@/data/query/derived';
import {
  useActiveWorkspace,
  usePrefs,
  useSetActiveWorkspace,
  useStrategies,
  useTags,
  useTrades,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { localDate } from '@/domain/time';
import { rangeCaption } from '@/lib/range-label';
import { hasActiveFilters, switchWorkspaceFilters } from '../filter-model';
import { Drilldown } from './drilldown';
import { MistakesCard } from './mistakes-card';
import { PlanCard } from './plan-card';
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
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const setActive = useSetActiveWorkspace();
  const queryClient = useQueryClient();

  const [currency, setCurrency] = useState<string>();
  const [drill, setDrill] = useState<Drill | null>(null);
  const anchors = useDrillAnchors();
  const root = useRef<HTMLDivElement>(null);
  const rulesTable = useRef<HTMLTableElement>(null);
  const mistakesList = useRef<HTMLUListElement>(null);
  // After "Clear filters" or "Open the sample workspace" the button is gone: focus the dashboard that replaces it.
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
      today === undefined
    )
      return undefined;
    const withClosed = metrics.data.filter((m) => m.summary.closedCount > 0);
    const range = resolveRange(shownFilters.range, today);
    const caption = rangeCaption(range, today);
    if (withClosed.length === 0)
      return { withClosed, caption, model: undefined };
    const chosen = withClosed.some((m) => m.currency === currency)
      ? currency
      : undefined;
    const partition = pickPartition(metrics.data, chosen, prefs.baseCurrency);
    const model = buildDashboard(partition, {
      strategies,
      tags,
      goals: goalsFor(prefs, workspace.data),
      baseCurrency: prefs.baseCurrency,
      ctx: metricContextOf(prefs),
      range,
      today,
    });
    return { withClosed, caption, model };
  }, [
    metrics.data,
    shownFilters,
    prefs,
    workspace.data,
    strategies,
    tags,
    today,
    currency,
  ]);

  const model = view?.model;
  useEffect(() => {
    if (model && focusOnReady.current) {
      focusOnReady.current = false;
      root.current?.focus();
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
    const variant =
      allTrades.length === 0
        ? 'no-trades'
        : hasActiveFilters(shownFilters)
          ? 'no-matches'
          : 'no-closed';
    return (
      <DashboardEmpty
        variant={variant}
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
    <div
      ref={root}
      tabIndex={-1}
      data-testid="dashboard-ready"
      className="flex min-w-0 flex-col gap-4 p-5 outline-none"
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
        onOpenRule={(ruleId, button) => open({ kind: 'rule', ruleId }, button)}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
      </div>
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
        />
      ) : null}
    </div>
  );
}
