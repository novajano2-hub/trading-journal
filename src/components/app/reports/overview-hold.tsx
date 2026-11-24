'use client';

import { Timer } from '@phosphor-icons/react/dist/ssr';
import { formatDuration } from '@/lib/format';
import { Stat, StatCard } from './overview-stat';
import type { ReportData } from './use-report-data';

const text = (minutes: number | null) =>
  minutes === null ? null : formatDuration(minutes * 60_000);

/** Overview: the average hold time over all closed trades and over the winners, losers and breakevens. */
export function OverviewHold({
  data,
}: {
  data: ReportData;
}): React.JSX.Element {
  const h = data.partition.holds;
  return (
    <StatCard title="Hold time" icon={Timer}>
      <Stat id="hold-time" data={data}>
        {text(h.all)}
      </Stat>
      <Stat id="hold-time-wins" data={data}>
        {text(h.wins)}
      </Stat>
      <Stat id="hold-time-losses" data={data}>
        {text(h.losses)}
      </Stat>
      <Stat id="hold-time-breakevens" data={data}>
        {text(h.breakevens)}
      </Stat>
    </StatCard>
  );
}
