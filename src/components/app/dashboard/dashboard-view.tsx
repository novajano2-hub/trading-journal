'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Segmented } from '@/components/ui/segmented';
import { resolveRange } from '@/data/filters';
import { metricContextOf } from '@/data/metrics';
import {
  useGlobalFilters,
  useTradeSet,
  useWidgetData,
} from '@/data/query/derived';
import {
  useAccounts,
  useActiveWorkspace,
  useCashFlows,
  useImportHistory,
  usePrefs,
  useSetActiveWorkspace,
  useTrades,
  useUserAccounts,
} from '@/data/query/hooks';
import { StorageUnavailableError } from '@/data/repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { DEFAULT_TEMPLATE, templatesOf } from '@/domain/dashboard/templates';
import { isWidgetKey, WIDGETS } from '@/domain/dashboard/widgets';
import { isClosed } from '@/domain/trade-status';
import { localDate } from '@/domain/time';
import type { Account, ImportJob, WidgetKey, WidgetRef } from '@/domain/types';
import {
  FigureSourceContext,
  pctBaseOf,
  type FigureSource,
} from '@/lib/display';
import { rangeCaption } from '@/lib/range-label';
import { shortTime } from '@/lib/time-format';
import { usePhone } from '@/lib/use-phone';
import { switchWorkspaceFilters } from '../filter-model';
import { EditSurface } from './edit-mode';
import { useDashboardEdit } from './edit-session';
import { DashboardEmpty, DashboardError, DashboardSkeleton } from './states';
import {
  WidgetPageContext,
  WidgetTemplateContext,
  type WidgetPage,
} from './widgets/context';
import { LowerGrid, UpperStrip, WidgetCell } from './widgets/layout';
import { WIDGET_RENDER } from './widgets/registry';

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
 * One section of the template: each widget in its cell, in the template's
 * order. A key this build does not know is skipped here (and kept on the
 * template, so a newer build's widget survives).
 */
function Widgets({
  refs,
  section,
}: {
  refs: readonly WidgetRef[];
  section: 'upper' | 'lower';
}): React.JSX.Element[] {
  return refs.flatMap((ref, i) => {
    if (!isWidgetKey(ref.key)) return [];
    const Render = WIDGET_RENDER[ref.key];
    return [
      <WidgetCell
        key={`${i}:${ref.key}`}
        wide={section === 'lower' && WIDGETS[ref.key].size === 'wide'}
      >
        <Render settings={ref.settings} />
      </WidgetCell>,
    ];
  });
}

/**
 * The Dashboard: the template in use, its widgets in an upper strip and a
 * lower grid, over the URL's filters. Render inside `<Suspense>`: it reads
 * the search params.
 */
export function DashboardView(): React.JSX.Element {
  const { filters, setFilters } = useGlobalFilters();
  const set = useTradeSet(filters);
  const prefs = usePrefs().data;
  const workspace = useActiveWorkspace();
  const allTrades = useTrades().data;
  const accounts = useAccounts().data;
  const flows = useCashFlows().data;
  const setActive = useSetActiveWorkspace();
  const queryClient = useQueryClient();
  const imports = useImportHistory().data;
  const userAccounts = useUserAccounts().data;
  const edit = useDashboardEdit();
  const phone = usePhone();

  // The template in use, and the widgets of it this build knows.
  const template = prefs ? templatesOf(prefs).inUse : DEFAULT_TEMPLATE;
  const keys = useMemo(
    () =>
      [...template.upper, ...template.lower].flatMap((r) =>
        isWidgetKey(r.key) ? [r.key] : [],
      ) satisfies WidgetKey[],
    [template],
  );

  // One currency at a time (C58): the one chosen if it has closed trades, else the base currency
  // if it has, else the first that has.
  const [chosen, setChosen] = useState<string>();
  const closedCurrencies = useMemo(() => {
    if (!set.data || !prefs) return undefined;
    const base = prefs.baseCurrency;
    return [
      ...new Set(set.data.trades.filter(isClosed).map((t) => t.pnlCurrency)),
    ].sort((a, b) =>
      a === b ? 0 : a === base ? -1 : b === base ? 1 : a < b ? -1 : 1,
    );
  }, [set.data, prefs]);
  const currency =
    closedCurrencies === undefined || prefs === undefined
      ? undefined
      : chosen !== undefined && closedCurrencies.includes(chosen)
        ? chosen
        : closedCurrencies.includes(prefs.baseCurrency)
          ? prefs.baseCurrency
          : (closedCurrencies[0] ?? prefs.baseCurrency);

  const widgets = useWidgetData(
    keys,
    currency === undefined ? {} : { currency },
  );

  // After "Open the sample workspace" the button is gone: focus the dashboard that replaces it.
  const ready = useRef<HTMLDivElement>(null);
  const focusOnReady = useRef(false);
  const shown = set.data !== undefined && widgets.data !== undefined;
  useEffect(() => {
    if (shown && focusOnReady.current) {
      focusOnReady.current = false;
      ready.current?.focus();
    }
  }, [shown]);

  const timeZone = prefs?.timeZone;
  const today =
    timeZone === undefined
      ? undefined
      : localDate(new Date().toISOString(), timeZone);
  const shownFilters = set.data?.filters;

  // What every widget needs to read money in the display unit (`useDisplay`) and the range in words.
  const view = useMemo(() => {
    if (
      !set.data ||
      !shownFilters ||
      !prefs ||
      !accounts ||
      !flows ||
      !allTrades ||
      today === undefined ||
      currency === undefined
    )
      return undefined;
    const range = resolveRange(shownFilters.range, today, prefs.weekStart);
    const ctx = { ...metricContextOf(prefs), range };
    const own = set.data.trades.filter((t) => t.pnlCurrency === currency);
    const source: FigureSource = {
      tradesById: new Map(own.map((t) => [t.id, t])),
      ctx,
      pctBase: pctBaseOf({
        accounts,
        flows,
        trades: allTrades,
        accountIds: shownFilters.accountIds,
        currency,
        from: range.from,
        timeZone: prefs.timeZone,
      }),
    };
    return { source, caption: rangeCaption(range, today) };
  }, [
    set.data,
    shownFilters,
    prefs,
    accounts,
    flows,
    allTrades,
    today,
    currency,
  ]);

  const page = useMemo<WidgetPage | undefined>(
    () =>
      widgets.data && view
        ? { ...widgets.data, caption: view.caption }
        : undefined,
    [widgets.data, view],
  );

  // Editing the template: its bars and add places take the page, whatever the data is doing.
  // (A phone edits in a sheet over the page, which EditSheet draws.)
  if (edit?.session && !phone)
    return <EditSurface edit={edit} session={edit.session} />;

  const error = workspace.error ?? set.error ?? widgets.error;
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
  if (!page || !view || !allTrades || !shownFilters || !accounts)
    return <DashboardSkeleton />;

  // Nothing to compute: no trade in the workspace, or every account archived and none picked
  // (the trades are there, out of view; E57). Any other nothing leaves the widgets, each saying so.
  const allArchived =
    accounts.length > 0 &&
    accounts.every((a) => a.status === 'archived') &&
    shownFilters.accountIds.length === 0;
  if (
    allTrades.length === 0 ||
    (allArchived && set.data!.matched.length === 0)
  ) {
    return (
      <DashboardEmpty
        variant={allTrades.length === 0 ? 'no-trades' : 'archived'}
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

  return (
    <FigureSourceContext.Provider value={view.source}>
      <WidgetPageContext.Provider value={page}>
        <div
          ref={ready}
          tabIndex={-1}
          data-testid="dashboard-ready"
          className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 outline-none lg:pt-0"
        >
          <LastImport
            jobs={imports}
            accounts={userAccounts}
            timeZone={timeZone!}
          />
          {closedCurrencies && closedCurrencies.length > 1 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Segmented
                label="Currency"
                options={closedCurrencies.map((c) => ({ value: c, label: c }))}
                value={page.currency}
                onChange={setChosen}
                coarseTargets
              />
              <p className="text-[13px] text-muted">
                Each currency is shown on its own. Converting between them
                isn&apos;t built yet.
              </p>
            </div>
          ) : null}
          <WidgetTemplateContext.Provider value={template.id}>
            {template.upper.length > 0 ? (
              <UpperStrip>
                <Widgets refs={template.upper} section="upper" />
              </UpperStrip>
            ) : null}
            {template.lower.length > 0 ? (
              <LowerGrid>
                <Widgets refs={template.lower} section="lower" />
              </LowerGrid>
            ) : null}
          </WidgetTemplateContext.Provider>
        </div>
      </WidgetPageContext.Provider>
    </FigureSourceContext.Provider>
  );
}
