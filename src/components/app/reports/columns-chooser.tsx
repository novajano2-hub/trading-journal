'use client';

import { Columns } from '@phosphor-icons/react/dist/ssr';
import { Popover } from 'radix-ui';
import { useState } from 'react';
import {
  REPORT_COLUMNS,
  toggleColumn,
  type ReportColumnId,
} from './report-columns';

/**
 * The "Columns" button of a breakdown table and its panel: a checkbox per
 * column. At least one stays on. The choice is the caller's to keep (in the
 * address); this only says what changed.
 */
export function ColumnsChooser({
  shown,
  labelOf,
  onChange,
  onReset,
}: {
  shown: readonly ReportColumnId[];
  /** A column's name as the table reads it (Net or Gross P&L). */
  labelOf(id: ReportColumnId, fallback: string): string;
  onChange(next: ReportColumnId[]): void;
  onReset(): void;
}): React.JSX.Element {
  // The address carries the choice but updates a beat after the click, so the
  // ticks keep their own copy: it flips at once and follows `shown` when that changes.
  const key = shown.join(',');
  const [local, setLocal] = useState({ key, shown });
  if (local.key !== key) setLocal({ key, shown });
  const current = local.shown;
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex h-[30px] items-center gap-1.5 rounded-control border border-line bg-surface-1 px-3 text-[13.5px] font-medium whitespace-nowrap text-muted shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:border-accent/35 pointer-coarse:h-11">
        <Columns size={16} aria-hidden="true" className="text-faint" />
        Columns
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-h-(--radix-popover-content-available-height) w-[240px] origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <ul aria-label="Table columns">
            {REPORT_COLUMNS.map(({ id, label }) => {
              const on = current.includes(id);
              const name = labelOf(id, label);
              return (
                <li key={id} className="rounded-[8px] pl-2 hover:bg-sunken">
                  <label
                    className={`flex min-h-9 cursor-pointer items-center gap-2.5 text-[13.5px] pointer-coarse:min-h-11 ${on ? '' : 'text-muted'}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={on && current.length === 1}
                      onChange={() => {
                        const next = toggleColumn(current, id);
                        setLocal({ key: local.key, shown: next });
                        onChange(next);
                      }}
                      className="size-4 flex-none accent-[var(--accent)]"
                    />
                    <span className="truncate">{name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-line pt-1.5">
            <button
              type="button"
              onClick={onReset}
              className="inline-flex h-8 w-full items-center rounded-[8px] px-2 text-[13px] font-semibold text-accent-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
            >
              Reset to default
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
