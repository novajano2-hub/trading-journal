'use client';

import { useId, useMemo, useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, Plus, X } from '@phosphor-icons/react/dist/ssr';
import { usePrefs, useTrades } from '@/data/query/hooks';
import { dayLabel } from '@/data/seed/calendar';
import { localDate } from '@/domain/time';
import type { Trade } from '@/domain/types';
import { formatInstrument } from '@/lib/format';
import { InstrumentName } from '../dashboard/shared';

/** The most trades a search lists beyond the day's own. */
const SEARCH_LIMIT = 30;

/** "ES Dec 26": the instrument as the chips and options name it. */
export function instrumentText(trade: Trade, timeZone: string): string {
  const { name, detail } = formatInstrument(
    trade.instrument,
    trade.openedAt,
    timeZone,
  );
  return detail ? `${name} ${detail}` : name;
}

type Option = { trade: Trade; group: 'day' | 'all' };

/**
 * Trades to link, as a combobox: the note's day first, then a search over
 * every trade. The arrow keys move, Enter picks (or unpicks), Escape clears
 * the text and then closes.
 */
function TradePicker({
  trades,
  dayIds,
  linked,
  timeZone,
  onToggle,
}: {
  trades: readonly Trade[];
  dayIds: ReadonlySet<string>;
  linked: readonly string[];
  timeZone: string;
  onToggle(id: string): void;
}): React.JSX.Element {
  const id = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const text = query.trim().toLowerCase();

  const options = useMemo((): Option[] => {
    const match = (t: Trade) =>
      text === '' ||
      instrumentText(t, timeZone).toLowerCase().includes(text) ||
      t.instrument.symbol.toLowerCase().includes(text);
    const day = trades
      .filter((t) => dayIds.has(t.id) && match(t))
      .map((trade): Option => ({ trade, group: 'day' }));
    if (text === '') return day;
    const rest = trades
      .filter((t) => !dayIds.has(t.id) && match(t))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, SEARCH_LIMIT)
      .map((trade): Option => ({ trade, group: 'all' }));
    return [...day, ...rest];
  }, [trades, dayIds, text, timeZone]);

  const current = Math.min(active, Math.max(0, options.length - 1));
  const optionId = (i: number) => `${id}-opt-${i}`;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (n) setActive((current + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (n) setActive((current - 1 + n) % n);
        break;
      case 'Enter':
        e.preventDefault();
        if (options[current]) onToggle(options[current].trade.id);
        break;
      case 'Escape':
        if (query !== '') {
          e.preventDefault();
          e.stopPropagation();
          setQuery('');
        }
        break;
    }
  };

  const section = (group: Option['group'], label: string) => {
    const rows = options.flatMap((o, i) =>
      o.group === group ? [{ o, i }] : [],
    );
    if (rows.length === 0) return null;
    return (
      <div role="group" aria-labelledby={`${id}-${group}`} className="py-1">
        <div
          id={`${id}-${group}`}
          className="px-2 pt-1 pb-1 text-xs font-medium text-faint"
        >
          {label}
        </div>
        {rows.map(({ o, i }) => {
          const on = linked.includes(o.trade.id);
          return (
            <div
              key={o.trade.id}
              id={optionId(i)}
              role="option"
              aria-selected={on}
              // Keep the focus in the text box.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToggle(o.trade.id)}
              onMouseMove={() => setActive(i)}
              className={`flex min-h-8 cursor-pointer items-center justify-between gap-2 rounded-[8px] px-2 text-[13.5px] text-text pointer-coarse:min-h-11 ${i === current ? 'bg-sunken' : ''} ${on ? 'font-semibold' : ''}`}
            >
              <span className="min-w-0 truncate">
                {instrumentText(o.trade, timeZone)}
                <span className="ml-1.5 font-normal text-faint">
                  {dayLabel(localDate(o.trade.openedAt, timeZone), false)}
                </span>
              </span>
              {on ? (
                <Check
                  size={14}
                  weight="bold"
                  aria-hidden="true"
                  className="flex-none text-accent"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        role="combobox"
        aria-label="Find a trade"
        aria-expanded="true"
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={options.length ? optionId(current) : undefined}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder="Search all trades"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-control border border-line bg-surface-1 px-3 text-[13.5px] text-text placeholder:text-faint hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
      />
      <div
        id={`${id}-list`}
        role="listbox"
        aria-label="Find a trade list"
        aria-multiselectable="true"
        className="max-h-[260px] overflow-y-auto"
      >
        {section('day', 'On this day')}
        {section('all', 'Other trades')}
        {options.length === 0 ? (
          <p className="px-2 py-3 text-[13px] text-faint">
            {text === ''
              ? 'No trades on this day. Search to find one.'
              : 'No trade matches.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The trades a note links to, as chips each with its own Unlink button, and a
 * "+ Link" picker. `chip` draws a trade's chip (the day card adds that day's
 * figure); by default it is the instrument alone. `dayIds` are the trades of
 * the note's day; without them the day's trades are those opened or closed on
 * `date`.
 */
export function LinkedTrades({
  linkedIds,
  date,
  dayIds,
  readOnly,
  chip,
  onChange,
}: {
  linkedIds: readonly string[];
  date: string | undefined;
  dayIds?: ReadonlySet<string>;
  readOnly: boolean;
  chip?(trade: Trade): React.ReactNode;
  onChange(ids: string[]): void;
}): React.JSX.Element | null {
  const all = useTrades().data;
  const timeZone = usePrefs().data?.timeZone ?? 'UTC';
  const byId = useMemo(() => new Map((all ?? []).map((t) => [t.id, t])), [all]);
  const day = useMemo(() => {
    if (dayIds) return dayIds;
    const out = new Set<string>();
    if (date)
      for (const t of all ?? [])
        if (
          localDate(t.openedAt, timeZone) === date ||
          (t.closedAt && localDate(t.closedAt, timeZone) === date)
        )
          out.add(t.id);
    return out;
  }, [dayIds, all, date, timeZone]);

  const shown = linkedIds.flatMap((id) => {
    const t = byId.get(id);
    return t ? [t] : [];
  });
  if (readOnly && shown.length === 0) return null;
  const toggle = (id: string) =>
    onChange(
      linkedIds.includes(id)
        ? linkedIds.filter((x) => x !== id)
        : [...linkedIds, id],
    );

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[12.5px] text-faint">Linked trades</span>
      {shown.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-0.5">
          {chip ? (
            chip(t)
          ) : (
            <span className="inline-flex min-h-[26px] items-center rounded-[8px] bg-surface-1 px-2.5 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line-2),var(--shadow-chip)] pointer-coarse:min-h-11">
              <InstrumentName
                trade={t}
                timeZone={timeZone}
                className="font-semibold"
                detailClassName="font-normal text-muted"
              />
            </span>
          )}
          {readOnly ? null : (
            <button
              type="button"
              aria-label={`Unlink ${instrumentText(t, timeZone)}`}
              onClick={() => toggle(t.id)}
              className="grid size-5 place-items-center rounded-full text-faint outline-offset-0 hover:bg-text/10 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
            >
              <X size={11} weight="bold" aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {readOnly ? null : (
        <Popover.Root>
          <Popover.Trigger
            aria-label="Link a trade"
            className="inline-flex min-h-[26px] items-center gap-1 rounded-[8px] px-2.5 text-[12.5px] font-medium text-faint shadow-[inset_0_0_0_1px_var(--line-2)] outline-offset-2 hover:text-text hover:shadow-[inset_0_0_0_1px_var(--faint)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 pointer-coarse:px-3"
          >
            <Plus size={11} weight="bold" aria-hidden="true" />
            Link
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              collisionPadding={12}
              className="z-[60] w-[320px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
            >
              <TradePicker
                trades={all ?? []}
                dayIds={day}
                linked={linkedIds}
                timeZone={timeZone}
                onToggle={toggle}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}
