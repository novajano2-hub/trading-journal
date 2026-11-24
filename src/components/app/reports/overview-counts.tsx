'use client';

import { useMemo } from 'react';
import { loggedDays } from '@/domain/metrics/days';
import { useJournal } from '@/data/query/hooks';
import { Stat, StatCard } from './overview-stat';
import type { ReportData } from './use-report-data';

/** Overview: how many trades won, lost, broke even and are still open. */
export function OverviewTradeCounts({
  data,
}: {
  data: ReportData;
}): React.JSX.Element {
  const s = data.partition.summary;
  return (
    <StatCard group="trade-counts" title="Trade counts">
      <Stat id="winners" data={data}>
        {s.wins}
      </Stat>
      <Stat id="losers" data={data}>
        {s.losses}
      </Stat>
      <Stat id="breakevens" data={data}>
        {s.breakevens}
      </Stat>
      <Stat id="open-trades" data={data}>
        {s.openCount}
      </Stat>
    </StatCard>
  );
}

/** Overview: trading, green, red and flat days, and the days with a daily note. */
export function OverviewDayCounts({
  data,
}: {
  data: ReportData;
}): React.JSX.Element {
  const ds = data.partition.daySummary;
  const journal = useJournal();
  const entries = journal.data;
  const logged = useMemo(
    () => (entries ? loggedDays(entries, data.ctx.range) : null),
    [entries, data.ctx.range],
  );
  return (
    <StatCard group="day-counts" title="Day counts">
      <Stat id="trading-days" data={data}>
        {data.partition.days.length}
      </Stat>
      <Stat id="green-day-count" data={data}>
        {ds.greenDays}
      </Stat>
      <Stat id="red-day-count" data={data}>
        {ds.redDays}
      </Stat>
      <Stat id="flat-day-count" data={data}>
        {ds.flatDays}
      </Stat>
      <Stat id="logged-days" data={data}>
        {logged !== null ? (
          logged
        ) : journal.isError ? (
          <span className="font-medium text-faint">Could not load</span>
        ) : (
          <span
            role="status"
            aria-label="Loading logged days"
            className="inline-block h-4 w-8 rounded-chip bg-sunken align-middle"
          />
        )}
      </Stat>
    </StatCard>
  );
}
