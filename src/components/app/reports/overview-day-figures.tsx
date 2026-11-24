'use client';

import { CalendarBlank } from '@phosphor-icons/react/dist/ssr';
import { calendarHref } from '@/data/report-links';
import { formatPct, plural } from '@/lib/format';
import { signTone } from '../dashboard/shared';
import { periodText } from './report-chart';
import { Stat, StatCard, useMoney } from './overview-stat';
import type { ReportData } from './use-report-data';

/**
 * Overview: the day averages, the largest green and red days (each opens that
 * day on the calendar), the average daily volume and the average drawdown.
 */
export function OverviewDayFigures({
  data,
}: {
  data: ReportData;
}): React.JSX.Element {
  const p = data.partition;
  const ds = p.daySummary;
  const dd = p.avgDrawdown;
  const money = useMoney(data);
  const green = ds.largestGreenDay;
  const red = ds.largestRedDay;
  const open = (day: string) => `Open ${periodText(day)} on the calendar`;
  return (
    <StatCard title="Day figures" icon={CalendarBlank}>
      <Stat
        id="avg-daily-pnl"
        data={data}
        tone={signTone(ds.avgDailyPnl ?? 0)}
        sub={`${p.days.length} ${plural(p.days.length, 'day')}`}
      >
        {money(ds.avgDailyPnl)}
      </Stat>
      <Stat
        id="avg-daily-win-loss"
        data={data}
        sub={
          ds.avgGreenDay === null || ds.avgRedDay === null ? undefined : (
            <>
              {money(ds.avgGreenDay)} over {money(ds.avgRedDay)}
            </>
          )
        }
      >
        {ds.avgWinLoss === null ? null : ds.avgWinLoss.toFixed(2)}
      </Stat>
      <Stat
        id="largest-green-day"
        data={data}
        tone="text-gain"
        sub={green ? periodText(green.date) : undefined}
        href={green ? calendarHref(data.filters, green.date) : undefined}
        linkLabel={green ? open(green.date) : undefined}
      >
        {money(green?.net ?? null)}
      </Stat>
      <Stat
        id="largest-red-day"
        data={data}
        tone="text-loss"
        sub={red ? periodText(red.date) : undefined}
        href={red ? calendarHref(data.filters, red.date) : undefined}
        linkLabel={red ? open(red.date) : undefined}
      >
        {money(red?.net ?? null)}
      </Stat>
      <Stat
        id="avg-daily-volume"
        data={data}
        sub={`${Number(p.volume.toFixed(2)).toLocaleString('en-US')} in all`}
      >
        {p.avgDailyVolume === null
          ? null
          : Number(p.avgDailyVolume.toFixed(2)).toLocaleString('en-US')}
      </Stat>
      <Stat
        id="avg-drawdown"
        data={data}
        tone={dd.amount === null ? '' : 'text-loss'}
        sub={
          dd.days === 0
            ? undefined
            : `${dd.days} ${plural(dd.days, 'day')} under a peak`
        }
      >
        {money(dd.amount === null ? null : -dd.amount)}
      </Stat>
      <Stat
        id="avg-drawdown-pct"
        data={data}
        tone={dd.pct === null ? '' : 'text-loss'}
      >
        {dd.pct === null ? null : `−${formatPct(dd.pct, 2)}`}
      </Stat>
    </StatCard>
  );
}
