'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { Segmented } from '@/components/ui/segmented';
import type { BreakdownKey, BreakdownRow } from '@/domain/metrics/breakdowns';
import { BreakdownCards } from './breakdown-report';
import { ReportScope } from './report-scope';
import { SubTabs } from './sub-tabs';
import { writeParam, type ReportData } from './use-report-data';

type Tab = 'weekday' | 'month' | 'time' | 'duration';
type Basis = 'entry' | 'exit';
const BUCKETS = [5, 15, 30, 60] as const;

const TABS: { value: Tab; label: string }[] = [
  { value: 'weekday', label: 'Weekday' },
  { value: 'month', label: 'Month' },
  { value: 'time', label: 'Time of day' },
  { value: 'duration', label: 'Duration' },
];

const BY: Record<Tab, BreakdownKey> = {
  weekday: 'weekday',
  month: 'month',
  time: 'time-of-day',
  duration: 'duration',
};

const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** "10:00" in a 15-minute bucket reads "10:00 to 10:15". */
function timeSpan(width: number): (row: BreakdownRow) => string {
  return (row) => {
    const [h, m] = row.key.split(':').map(Number) as [number, number];
    return `${row.label} to ${hhmm(h * 60 + m + width)}`;
  };
}

function Body({ data }: { data: ReportData }): React.JSX.Element {
  const params = useSearchParams();
  const tab =
    TABS.find((t) => t.value === params.get('tab'))?.value ?? 'weekday';
  const bucket = BUCKETS.find((b) => String(b) === params.get('bucket')) ?? 30;
  const basis: Basis = params.get('basis') === 'exit' ? 'exit' : 'entry';
  const options = useMemo(
    () => ({ timeBasis: basis, bucketMinutes: bucket }) as const,
    [basis, bucket],
  );

  const timed = tab !== 'duration';
  const controls = timed ? (
    <>
      <Segmented
        label="Time basis"
        options={[
          { value: 'entry', label: 'Entry time' },
          { value: 'exit', label: 'Exit time' },
        ]}
        value={basis}
        onChange={(v) => writeParam('basis', v)}
        coarseTargets
      />
      {tab === 'time' ? (
        <Segmented
          label="Bucket"
          options={BUCKETS.map((b) => ({
            value: String(b),
            label: `${b} min`,
          }))}
          value={String(bucket)}
          onChange={(v) => writeParam('bucket', v)}
          coarseTargets
        />
      ) : null}
    </>
  ) : undefined;

  const noun = {
    weekday: 'weekday',
    month: 'month',
    time: 'time of day',
    duration: 'duration',
  }[tab];
  const byBasis = timed ? `, by ${basis}` : '';
  return (
    <SubTabs label="Day and time view" param="tab" options={TABS} value={tab}>
      <BreakdownCards
        key={tab}
        data={data}
        report="day-time"
        by={BY[tab]}
        options={options}
        chartLabel={`Net P&L by ${noun}${byBasis}`}
        tableName={`${TABS.find((t) => t.value === tab)!.label} summary`}
        rowTitle={
          tab === 'time' ? 'Time' : TABS.find((t) => t.value === tab)!.label
        }
        plural={
          {
            weekday: 'Weekdays',
            month: 'Months',
            time: 'Times',
            duration: 'Durations',
          }[tab]
        }
        chartTitle={`By ${noun}`}
        title={
          tab === 'time'
            ? bucket === 60
              ? 'Each hour'
              : `Each ${bucket} minutes`
            : `Each ${noun}`
        }
        caption={
          timed
            ? `${data.ctx.timeZone}, by ${basis} ${tab === 'time' ? 'time' : 'day'}`
            : 'From the first fill to the last'
        }
        visible={tab === 'time' ? 'traded' : 'all'}
        chartVisible={tab === 'time' ? 'ends' : 'all'}
        labelOf={tab === 'time' ? timeSpan(bucket) : undefined}
        controls={controls}
      />
    </SubTabs>
  );
}

/**
 * Reports, Day & time: net and win rate by weekday, month, time of day or
 * duration. Time of day has a 5, 15, 30 or 60 minute bucket; the others and it
 * can read the trade's entry or its exit. The address holds it all:
 * `?tab=time&bucket=15&basis=exit`. Render inside `<Suspense>`.
 */
export function DayTimeView(): React.JSX.Element {
  return (
    <ReportScope testId="reports-day-time">
      {(data) => <Body data={data} />}
    </ReportScope>
  );
}
