'use client';

import { CalendarCheck, ListNumbers } from '@phosphor-icons/react/dist/ssr';
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
    <StatCard title="Trade counts" icon={ListNumbers}>
      <Stat id="winners" data={data} tone="text-gain">
        {s.wins}
      </Stat>
      <Stat id="losers" data={data} tone="text-loss">
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
  const entries = useJournal().data;
  const logged = useMemo(
    () => (entries ? loggedDays(entries, data.ctx.range) : null),
    [entries, data.ctx.range],
  );
  return (
    <StatCard title="Day counts" icon={CalendarCheck}>
      <Stat id="trading-days" data={data}>
        {data.partition.days.length}
      </Stat>
      <Stat id="green-day-count" data={data} tone="text-gain">
        {ds.greenDays}
      </Stat>
      <Stat id="red-day-count" data={data} tone="text-loss">
        {ds.redDays}
      </Stat>
      <Stat id="flat-day-count" data={data}>
        {ds.flatDays}
      </Stat>
      <Stat id="logged-days" data={data}>
        {logged}
      </Stat>
    </StatCard>
  );
}
