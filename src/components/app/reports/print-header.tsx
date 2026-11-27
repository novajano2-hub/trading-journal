'use client';

import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { UNIT_WORDS } from '@/content/display-units';
import {
  useAccounts,
  useActiveWorkspace,
  usePrefs,
  useStrategies,
  useTags,
} from '@/data/query/hooks';
import { rangeInWords } from '@/lib/range-label';
import { usePrintState } from '@/lib/use-printing';
import { accountsInWords, filterWords } from '../filter-model';
import { unitLeftOutText } from '../unit-notice';
import type { ReportData } from './use-report-data';

/**
 * What the unit and the P&L basis come to in one sentence: "Shown in dollars,
 * net of fees." Another currency names itself where "dollars" would be wrong.
 */
function shownText(data: ReportData, unit: keyof typeof UNIT_WORDS): string {
  const words =
    unit === 'dollar' && data.currency !== 'USD'
      ? `in ${data.currency}`
      : UNIT_WORDS[unit];
  return `Shown ${words}, ${data.basis === 'gross' ? 'before fees' : 'net of fees'}.`;
}

/**
 * The block at the head of a printed report: its name, and under it in words
 * what the pages show (the workspace and accounts, the range, the filters, the
 * unit and basis, and when it was made). It is on paper only: on screen the
 * page already says all of this in its bar and chips. It carries no amount,
 * so Privacy has nothing to hide in it; the unit it names is Privacy itself
 * ("with amounts hidden") when that is chosen. The time is the print's own
 * (the `beforeprint` event), not the page's age.
 */
export function PrintHeader({
  title,
  data,
}: {
  /** The report's name: "Performance report". */
  title: string;
  data: ReportData;
}): React.JSX.Element {
  const workspace = useActiveWorkspace().data;
  const accounts = useAccounts().data;
  const strategies = useStrategies().data;
  const tags = useTags().data;
  const prefs = usePrefs().data;
  const { madeAt } = usePrintState();

  const { filters, ctx } = data;
  const days = data.partition.days;
  const span = { from: days[0]?.date, to: days.at(-1)?.date };
  const filtered = filterWords(
    filters,
    {
      strategies: new Map((strategies ?? []).map((s) => [s.id, s.name])),
      tags: new Map((tags ?? []).map((t) => [t.id, t.name])),
    },
    prefs?.weekStart,
  );
  const unit = prefs?.displayUnit ?? 'dollar';
  const left = unitLeftOutText(unit, data.unitLeftOut);
  const made = format(new TZDate(madeAt, ctx.timeZone), 'd MMM yyyy, HH:mm');

  return (
    <header
      data-testid="print-header"
      data-print="keep"
      className="hidden pb-1 print:block"
    >
      <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-text">
        {title}
      </h1>
      <p className="mt-2 text-[12.5px] leading-[1.6] text-muted">
        <b className="font-semibold text-text">{workspace?.name ?? 'Keel'}</b>,{' '}
        {accountsInWords(accounts ?? [], filters)}.{' '}
        {rangeInWords(filters.range, ctx.range ?? {}, span)}. Filters:{' '}
        {filtered.length === 0 ? 'none' : filtered.join('; ')}.{' '}
        {shownText(data, unit)}
        {left ? ` ${left}` : ''}
        {data.currencies.length > 1
          ? ` ${data.currency} trades only.`
          : ''}{' '}
        Made {made}.
      </p>
    </header>
  );
}
