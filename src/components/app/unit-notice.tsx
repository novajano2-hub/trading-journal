'use client';

import { usePathname } from 'next/navigation';
import { useGlobalFilters, useTradeSet } from '@/data/query/derived';
import { usePrefs, useUpdatePrefs } from '@/data/query/hooks';
import { UNIT_SCOPE } from '@/content/display-units';
import { isTradeUnit } from '@/domain/metrics/units';
import { plural } from '@/lib/format';
import { filtersApply } from './nav';

/**
 * The words for a page whose trades the display unit narrowed: "Ticks counts
 * futures trades only, so 12 trades are left out." Exported for the pages
 * that apply filters of their own (Compare).
 */
export function unitLeftOutText(
  unit: Parameters<typeof isTradeUnit>[0],
  count: number,
): string | null {
  if (!isTradeUnit(unit) || count <= 0) return null;
  const { name, keeps } = UNIT_SCOPE[unit];
  return `${name} counts ${keeps} only, so ${count.toLocaleString('en-US')} ${plural(count, 'trade is', 'trades are')} left out.`;
}

/** The one quiet line, and its way back to Dollar. */
export function UnitLeftOut({
  count,
  className = '',
}: {
  count: number;
  className?: string;
}): React.JSX.Element {
  const unit = usePrefs().data?.displayUnit;
  const update = useUpdatePrefs();
  const text = unitLeftOutText(unit, count);
  return (
    // A live region while the page shows, so a unit chosen later is announced.
    <div data-testid="unit-notice" aria-live="polite" className={className}>
      {text ? (
        <p className="flex flex-wrap items-center gap-x-2.5 text-[12.5px] leading-[1.45] text-faint">
          <span>{text}</span>
          <button
            type="button"
            onClick={() => update.mutate({ displayUnit: 'dollar' })}
            className="inline-flex items-center rounded-chip font-semibold text-accent-ink underline-offset-2 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            Switch to Dollar
          </button>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Under the top bar of every page the global filters drive (Dashboard,
 * Trades, Calendar, Reports): how many of the trades the filters matched the
 * display unit leaves out (Part 2, U1). Silent under Dollar, Percentage and
 * Privacy, and when the unit keeps every trade. Render inside `<Suspense>`:
 * it reads the search params.
 */
export function UnitNotice(): React.JSX.Element | null {
  return filtersApply(usePathname()) ? <FilteredNotice /> : null;
}

function FilteredNotice(): React.JSX.Element | null {
  const { filters } = useGlobalFilters();
  const set = useTradeSet(filters);
  if (!set.data) return null;
  return (
    <UnitLeftOut count={set.data.unitLeftOut} className="px-5 [&>p]:pb-2" />
  );
}
