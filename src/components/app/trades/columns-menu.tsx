'use client';

import { ArrowDown, ArrowUp, Columns } from '@phosphor-icons/react/dist/ssr';
import { useState } from 'react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';
import {
  ALL_COLUMNS,
  COLUMN_LABELS,
  type ColumnId,
} from '@/data/trade-columns';

const TEXT_BUTTON =
  'inline-flex h-8 items-center rounded-[8px] px-2 text-[13px] font-semibold text-accent-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-11';

const ICON_BUTTON =
  'inline-grid size-7 place-items-center rounded-chip text-muted outline-offset-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-35 pointer-coarse:size-11';

/**
 * The "Columns" button and its panel (the record: a search box, select all and
 * select default; Update saves the choice). A checkbox per column, the shown
 * ones first in their order with up and down buttons, then the hidden ones.
 * Changes are held in the panel and saved only by Update; closing the panel
 * any other way throws them away. Keel's call (TradeZella unknown): at least
 * one column stays on.
 *
 * Keel's call (TradeZella unknown): Select all covers every column, not only
 * the ones a search matches; Update closes the panel; closing any other way
 * discards. (The record, lines 652 to 654, is silent on these.)
 */
export function ColumnsMenu({
  columns,
  defaults,
  onSave,
  choices = ALL_COLUMNS,
}: {
  /** Every column the menu may offer; the trade log's list unless a view widens it. */
  choices?: readonly ColumnId[];
  /** The shown columns now. */
  columns: readonly ColumnId[];
  /** What select default brings back. */
  defaults: readonly ColumnId[];
  /** Update: the chosen columns, in order. */
  onSave(next: ColumnId[]): void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ColumnId[]>([...columns]);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = (id: ColumnId) =>
    needle === '' || COLUMN_LABELS[id].label.toLowerCase().includes(needle);
  const hidden = choices.filter((id) => !draft.includes(id));
  const move = (index: number, by: -1 | 1) => {
    const next = [...draft];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    setDraft(next);
  };
  const none = needle !== '' && !draft.some(matches) && !hidden.some(matches);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft([...columns]);
          setQuery('');
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger className="inline-flex h-[34px] items-center gap-1.5 rounded-control border border-line bg-surface-1 px-3 text-[13.5px] font-medium whitespace-nowrap text-muted shadow-[0_1px_1px_rgb(18_22_51/0.04)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:border-accent/35 pointer-coarse:h-11">
        <Columns size={16} aria-hidden="true" className="text-faint" />
        Columns
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-h-(--radix-popover-content-available-height) w-[320px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <input
            type="search"
            aria-label="Search columns"
            placeholder="Search columns"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-1 h-8 w-full rounded-control border border-line bg-surface-1 px-2.5 text-[13.5px] text-text placeholder:text-faint hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          />
          {none ? (
            <p className="px-2 py-2 text-[13px] text-muted">
              No column matches.
            </p>
          ) : null}
          <ul aria-label="Shown columns">
            {draft.map((id, i) =>
              matches(id) ? (
                <li
                  key={id}
                  className="flex min-h-9 items-center gap-1 rounded-[8px] pr-0.5 pl-2 hover:bg-sunken"
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[13.5px] pointer-coarse:min-h-11">
                    <input
                      type="checkbox"
                      checked
                      disabled={draft.length === 1}
                      onChange={() => setDraft(draft.filter((c) => c !== id))}
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
                    disabled={i === draft.length - 1}
                    onClick={() => move(i, 1)}
                    className={ICON_BUTTON}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </li>
              ) : null,
            )}
          </ul>
          {hidden.some(matches) ? (
            <>
              <p className="mt-1 border-t border-line px-2 pt-2 pb-1 text-[12px] font-medium text-faint">
                Not shown
              </p>
              <ul aria-label="Hidden columns">
                {hidden.filter(matches).map((id) => (
                  <li key={id} className="rounded-[8px] pl-2 hover:bg-sunken">
                    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13.5px] text-muted pointer-coarse:min-h-11">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => setDraft([...draft, id])}
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
          <div className="mt-1 flex items-center gap-1 border-t border-line pt-1.5">
            <button
              type="button"
              onClick={() => setDraft([...draft, ...hidden])}
              disabled={hidden.length === 0}
              className={TEXT_BUTTON}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setDraft([...defaults])}
              className={TEXT_BUTTON}
            >
              Reset to default
            </button>
            <Button
              size="sm"
              className="ml-auto"
              onClick={() => {
                onSave(draft);
                setOpen(false);
              }}
            >
              Update
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
