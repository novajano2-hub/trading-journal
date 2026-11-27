'use client';

import { CaretDown, Check } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DropdownMenu } from 'radix-ui';
import { Suspense, type ReactNode } from 'react';
import { parseFilters, serializeFilters } from '@/data/filters';
import { StrategiesView, SymbolsView, TagsView } from './breakdown-report';
import { CalendarReportView } from './calendar-report';
import { CompareView } from './compare';
import { DayTimeView } from './day-time-report';
import { OptionsView } from './options-report';
import { PatternsView } from './patterns-report';
import { OverviewView } from './overview';
import { ScrollFade } from '@/components/ui/scroll-fade';
import { PerformanceView } from './performance';
import { RiskView } from './risk-report';
import { WinsLossesView } from './wins-losses';
import { ReportSkeleton } from './report-scope';
import {
  REPORT_LABELS,
  REPORT_MENU,
  tabOf,
  type ReportKey,
  type ReportTab,
} from './report-keys';

const TAB =
  'relative inline-flex h-7 flex-none items-center gap-1.5 rounded-[8px] px-[13px] text-[13.5px] font-medium whitespace-nowrap no-underline outline-offset-0 transition-[background-color,color,box-shadow] duration-200 ease-(--ease-glide) focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';
const TAB_OFF = 'text-muted hover:text-text';
const TAB_ON =
  'bg-surface-1 font-semibold text-text shadow-[var(--shadow-chip)] [[data-theme=dark]_&]:bg-line-2';

/**
 * A report's address from this page: its path, the global filters and the
 * currency, nothing page-specific. Compare is the exception: its groups own
 * their filters, so from another report its link writes the current filters as
 * Group A (`a=`) and leaves the global ones behind; from Compare itself it keeps
 * both groups.
 */
function hrefOf(
  key: ReportKey | 'overview',
  params: URLSearchParams,
  from: ReportKey | 'overview',
): string {
  const query = new URLSearchParams();
  if (key === 'compare') {
    if (from === 'compare') {
      for (const group of ['a', 'b']) {
        const value = params.get(group);
        if (value !== null) query.set(group, value);
      }
    } else {
      const current = serializeFilters(parseFilters(params)).toString();
      if (current) query.set('a', current);
    }
  } else
    serializeFilters(parseFilters(params)).forEach((v, k) => query.set(k, v));
  const cur = params.get('cur');
  if (cur) query.set('cur', cur);
  const qs = query.toString();
  const path = key === 'overview' ? '/app/reports' : `/app/reports/${key}`;
  return qs ? `${path}?${qs}` : path;
}

const SIMPLE_TABS: {
  tab: Exclude<ReportTab, 'reports'>;
  key: ReportKey | 'overview';
}[] = [
  { tab: 'overview', key: 'overview' },
  { tab: 'performance', key: 'performance' },
  { tab: 'compare', key: 'compare' },
  { tab: 'calendar', key: 'calendar' },
];

/**
 * The tabs every report sits under: Overview, Performance, the Reports menu
 * (Day & time, Symbols, Risk, Strategies, Tags, Patterns, Options, Wins vs losses),
 * Compare and Calendar. The menu's tab stays current while any of its reports
 * is open. Links carry the global filters. Render inside `<Suspense>`.
 */
export function ReportsShell({
  active,
  children,
}: {
  active: ReportKey | 'overview';
  children: ReactNode;
}): React.JSX.Element {
  const params = useSearchParams();
  const current = tabOf(active);
  const tabLink = (t: (typeof SIMPLE_TABS)[number]) => (
    <Link
      key={t.tab}
      href={hrefOf(t.key, params, active)}
      aria-current={current === t.tab ? 'page' : undefined}
      className={`${TAB} ${current === t.tab ? TAB_ON : TAB_OFF}`}
    >
      {REPORT_LABELS[t.key]}
    </Link>
  );
  return (
    <div className="flex min-w-0 flex-col gap-4 px-5 pt-1 pb-5 lg:pt-0 print:p-0">
      <ScrollFade
        tone="bg"
        rootClassName="-mx-5 max-w-[100vw] lg:max-w-full print:hidden"
        className="px-5 pb-1 [scrollbar-width:none]"
      >
        <nav aria-label="Reports">
          <div className="inline-flex rounded-[11px] bg-track p-[3px] shadow-[inset_0_1px_2px_rgb(18_22_51/0.07)] [[data-theme=dark]_&]:shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]">
            {tabLink(SIMPLE_TABS[0]!)}
            {tabLink(SIMPLE_TABS[1]!)}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-current={current === 'reports' ? 'page' : undefined}
                className={`${TAB} cursor-pointer ${current === 'reports' ? TAB_ON : TAB_OFF}`}
              >
                {current === 'reports' ? (
                  <>
                    <span className="sr-only">Reports: </span>
                    {REPORT_LABELS[active]}
                  </>
                ) : (
                  'Reports'
                )}
                <CaretDown size={12} weight="bold" aria-hidden="true" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  sideOffset={6}
                  collisionPadding={12}
                  aria-label="Reports"
                  className="z-50 min-w-[190px] rounded-control border border-line bg-surface-1 p-1 shadow-[var(--shadow)]"
                >
                  {REPORT_MENU.map((m) => (
                    <DropdownMenu.Item key={m.key} asChild>
                      <Link
                        href={hrefOf(m.key, params, active)}
                        className="relative flex min-h-9 cursor-pointer items-center rounded-[8px] py-1.5 pr-3 pl-8 text-[13.5px] text-text no-underline outline-none select-none data-highlighted:bg-sunken pointer-coarse:min-h-11"
                      >
                        {active === m.key ? (
                          <Check
                            size={16}
                            aria-hidden="true"
                            className="absolute left-2 text-accent-ink"
                          />
                        ) : null}
                        {m.label}
                      </Link>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {tabLink(SIMPLE_TABS[2]!)}
            {tabLink(SIMPLE_TABS[3]!)}
          </div>
        </nav>
      </ScrollFade>
      {children}
    </div>
  );
}

/** The report a key names. */
function ReportBody({
  report,
}: {
  report: ReportKey | 'overview';
}): React.JSX.Element {
  switch (report) {
    case 'overview':
      return <OverviewView />;
    case 'performance':
      return <PerformanceView />;
    case 'day-time':
      return <DayTimeView />;
    case 'symbols':
      return <SymbolsView />;
    case 'risk':
      return <RiskView />;
    case 'strategies':
      return <StrategiesView />;
    case 'tags':
      return <TagsView />;
    case 'patterns':
      return <PatternsView />;
    case 'options':
      return <OptionsView />;
    case 'wins-losses':
      return <WinsLossesView />;
    case 'compare':
      return <CompareView />;
    case 'calendar':
      return <CalendarReportView />;
  }
}

/** A reports route: the shell around the report named by `report`. */
export function ReportsPage({
  report,
}: {
  report: ReportKey | 'overview';
}): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="px-5 pt-1 pb-5 lg:pt-0">
          <ReportSkeleton />
        </div>
      }
    >
      <ReportsShell active={report}>
        <ReportBody report={report} />
      </ReportsShell>
    </Suspense>
  );
}
