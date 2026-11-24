'use client';

import { CalendarDots } from '@phosphor-icons/react/dist/ssr';
import { plural } from '@/lib/format';
import { signTone } from '../dashboard/shared';
import { periodText } from './report-chart';
import { Stat, StatCard, useDayValue } from './overview-stat';
import type { ReportData } from './use-report-data';

/** Overview: the best and the lowest month, each named, and the average per month. */
export function OverviewMonths({
  data,
}: {
  data: ReportData;
}): React.JSX.Element {
  const m = data.partition.months;
  const money = useDayValue(data);
  return (
    <StatCard group="months" title="Months" icon={CalendarDots}>
      <Stat
        id="best-month"
        data={data}
        tone={signTone(m.best?.net ?? 0)}
        sub={m.best ? periodText(m.best.month) : undefined}
      >
        {money(m.best?.net ?? null)}
      </Stat>
      <Stat
        id="worst-month"
        data={data}
        tone={signTone(m.lowest?.net ?? 0)}
        sub={m.lowest ? periodText(m.lowest.month) : undefined}
      >
        {money(m.lowest?.net ?? null)}
      </Stat>
      <Stat
        id="avg-month"
        data={data}
        tone={signTone(m.average ?? 0)}
        sub={
          m.months === 0
            ? undefined
            : `${m.months} ${plural(m.months, 'month')}`
        }
      >
        {money(m.average)}
      </Stat>
    </StatCard>
  );
}
