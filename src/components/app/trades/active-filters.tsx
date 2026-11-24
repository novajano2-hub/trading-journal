'use client';

import { X } from '@phosphor-icons/react/dist/ssr';
import type { GlobalFilters } from '@/data/filters';
import type { WeekStart } from '@/domain/types';
import { detailChips } from '../filter-model';

/**
 * The filters the top bar has no chip for (weekday, time, duration, size, R and
 * the like), as chips above the log, each with a button that clears it. A link
 * from a report arrives with these set, so they show where the count comes from.
 */
export function ActiveFilters({
  filters,
  onChange,
  weekStart,
}: {
  filters: GlobalFilters;
  /** The day weekdays read from: the chip lists them in that order. */
  weekStart?: WeekStart;
  onChange(next: GlobalFilters): void;
}): React.JSX.Element | null {
  const chips = detailChips(filters, weekStart);
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Other filters in use" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li
          key={chip.id}
          className="inline-flex h-8 max-w-full items-center gap-0.5 rounded-control border border-line bg-surface-1 pr-0.5 pl-2.5 text-[13.5px] font-semibold text-text shadow-[0_1px_1px_rgb(18_22_51/0.04)] pointer-coarse:h-11"
        >
          <span className="min-w-0 truncate">{chip.label}</span>
          <button
            type="button"
            aria-label={`Clear ${chip.label}`}
            onClick={() => onChange(chip.clear(filters))}
            className="grid size-7 flex-none place-items-center rounded-chip text-muted hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
          >
            <X size={13} weight="bold" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
