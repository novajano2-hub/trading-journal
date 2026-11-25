'use client';

import { ArrowDown, ArrowUp, Columns } from '@phosphor-icons/react/dist/ssr';
import { Popover } from 'radix-ui';
import {
  ALL_COLUMNS,
  COLUMN_LABELS,
  type ColumnId,
} from '@/data/trade-columns';

const ICON_BUTTON =
  'inline-grid size-7 place-items-center rounded-chip text-muted outline-offset-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-35 pointer-coarse:size-11';

/**
 * The "Columns" button and its panel: a checkbox per column, the shown ones
 * first in their order with up and down buttons, then the hidden ones. At
 * least one column stays on.
 */
export function ColumnsMenu({
  columns,
  onChange,
  onReset,
  choices = ALL_COLUMNS,
}: {
  /** Every column the menu may offer; the trade log's list unless a view widens it. */
  choices?: readonly ColumnId[];
  columns: readonly ColumnId[];
  onChange(next: ColumnId[]): void;
  onReset(): void;
}): React.JSX.Element {
  const hidden = choices.filter((id) => !columns.includes(id));
  const move = (index: number, by: -1 | 1) => {
    const next = [...columns];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    onChange(next);
  };
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex h-[34px] items-center gap-1.5 rounded-control border border-line bg-surface-1 px-3 text-[13.5px] font-medium whitespace-nowrap text-muted shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:border-accent/35 pointer-coarse:h-11">
        <Columns size={16} aria-hidden="true" className="text-faint" />
        Columns
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-h-(--radix-popover-content-available-height) w-[260px] origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <ul aria-label="Shown columns">
            {columns.map((id, i) => (
              <li
                key={id}
                className="flex min-h-9 items-center gap-1 rounded-[8px] pr-0.5 pl-2 hover:bg-sunken"
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[13.5px] pointer-coarse:min-h-11">
                  <input
                    type="checkbox"
                    checked
                    disabled={columns.length === 1}
                    onChange={() => onChange(columns.filter((c) => c !== id))}
                    className="size-4 flex-none accent-[var(--accent)]"
                  />
                  <span className="truncate">{COLUMN_LABELS[id].label}</span>
                </label>
                <button
                  type="button"
                  aria-label={`Move ${COLUMN_LABELS[id].label} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className={ICON_BUTTON}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${COLUMN_LABELS[id].label} down`}
                  disabled={i === columns.length - 1}
                  onClick={() => move(i, 1)}
                  className={ICON_BUTTON}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {hidden.length > 0 ? (
            <>
              <p className="mt-1 border-t border-line px-2 pt-2 pb-1 text-[12px] font-medium text-faint">
                Not shown
              </p>
              <ul aria-label="Hidden columns">
                {hidden.map((id) => (
                  <li key={id} className="rounded-[8px] pl-2 hover:bg-sunken">
                    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13.5px] text-muted pointer-coarse:min-h-11">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => onChange([...columns, id])}
                        className="size-4 flex-none accent-[var(--accent)]"
                      />
                      <span className="truncate">
                        {COLUMN_LABELS[id].label}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
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
