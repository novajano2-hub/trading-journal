'use client';

import { CalendarBlank } from '@phosphor-icons/react/dist/ssr';
import { dayValue } from '@/domain/metrics/days';
import { calendarHref } from '@/data/report-links';
import { formatPct, formatQty, plural } from '@/lib/format';
import { signTone } from '../dashboard/shared';
import { periodText } from './report-chart';
import { Stat, StatCard, useDayValue, useMoney } from './overview-stat';
import type { ReportData } from './use-report-data';
import { RatioText } from '../ratio-text';

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
  const value = useDayValue(data);
  const green = ds.largestGreenDay;
  const red = ds.largestRedDay;
  const open = (day: string) => `Open ${periodText(day)} on the calendar`;
  // With several currencies the calendar opens on the one this page reads.
  const cur = data.currencies.length > 1 ? data.currency : undefined;
  return (
    <StatCard group="day-figures" title="Day figures" icon={CalendarBlank}>
      <Stat
        id="avg-daily-pnl"
        data={data}
        tone={signTone(ds.avgDailyPnl ?? 0)}
        sub={`${p.days.length} ${plural(p.days.length, 'day')}`}
      >
        {value(ds.avgDailyPnl)}
      </Stat>
      <Stat
        id="avg-daily-win-loss"
        data={data}
        sub={
          ds.avgGreenValue === null || ds.avgRedValue === null ? undefined : (
            <>
              {value(ds.avgGreenValue)} over {value(ds.avgRedValue)}
            </>
          )
        }
      >
        {ds.avgWinLoss === null ? null : <RatioText value={ds.avgWinLoss} />}
      </Stat>
      <Stat
        id="largest-green-day"
        data={data}
        tone="text-gain"
        sub={green ? periodText(green.date) : undefined}
        href={green ? calendarHref(data.filters, green.date, cur) : undefined}
        linkLabel={green ? open(green.date) : undefined}
      >
        {value(green ? dayValue(green, data.ctx) : null)}
      </Stat>
      <Stat
        id="largest-red-day"
        data={data}
        tone="text-loss"
        sub={red ? periodText(red.date) : undefined}
        href={red ? calendarHref(data.filters, red.date, cur) : undefined}
        linkLabel={red ? open(red.date) : undefined}
      >
        {value(red ? dayValue(red, data.ctx) : null)}
      </Stat>
      <Stat
        id="avg-daily-volume"
        data={data}
        sub={`${formatQty(p.volume)} in all`}
      >
        {p.avgDailyVolume === null
          ? null
          : formatQty(Number(p.avgDailyVolume.toFixed(2)))}
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
