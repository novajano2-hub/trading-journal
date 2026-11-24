'use client';

import {
  FunnelSimple,
  MagnifyingGlass,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { Popover } from 'radix-ui';
import { INPUT } from '@/components/app/import/styles';
import type { AccountType } from '@/domain/types';
import { ACCOUNT_TYPES } from './account-dialog';
import type { AccountsView, AccountStatus } from './accounts-list';

const STATUS_LABELS: readonly { value: AccountStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const TRIGGER =
  'inline-flex h-9 items-center gap-1.5 rounded-control border border-line-2 bg-surface-1 px-3 text-[13.5px] font-medium whitespace-nowrap text-muted shadow-[var(--shadow-chip)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-faint focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:border-accent/35 pointer-coarse:h-11';

const toggle = <T extends string>(list: readonly T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/** One group of ticks in the Filter by panel. */
function Group<T extends string>({
  title,
  options,
  on,
  onChange,
}: {
  title: string;
  options: readonly { value: T; label: string }[];
  on: readonly T[];
  onChange(next: T[]): void;
}): React.JSX.Element {
  return (
    <fieldset className="min-w-0">
      <legend className="px-2 pt-1 pb-0.5 text-[12px] font-medium text-faint">
        {title}
      </legend>
      <ul>
        {options.map((o) => (
          <li key={o.value} className="rounded-[8px] pl-2 hover:bg-sunken">
            <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13.5px] pointer-coarse:min-h-11">
              <input
                type="checkbox"
                checked={on.includes(o.value)}
                onChange={() => onChange(toggle(on, o.value))}
                className="size-4 flex-none accent-[var(--accent)]"
              />
              <span className="truncate">{o.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** What the filters say, a chip each: its words and how to clear it. */
function chipsOf(
  view: AccountsView,
  set: Props['onFilters'],
): { key: string; text: string; clear(): void }[] {
  return [
    ...view.types.map((t) => ({
      key: `type:${t}`,
      text: `Type: ${ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t}`,
      clear: () => set({ types: view.types.filter((x) => x !== t) }),
    })),
    ...view.statuses.map((s) => ({
      key: `status:${s}`,
      text: `Status: ${STATUS_LABELS.find((x) => x.value === s)?.label ?? s}`,
      clear: () => set({ statuses: view.statuses.filter((x) => x !== s) }),
    })),
    ...view.currencies.map((c) => ({
      key: `ccy:${c}`,
      text: `Currency: ${c}`,
      clear: () => set({ currencies: view.currencies.filter((x) => x !== c) }),
    })),
  ];
}

interface Props {
  view: AccountsView;
  /** Every currency the workspace's accounts hold; the filter shows when there is more than one. */
  currencies: readonly string[];
  onSearch(q: string): void;
  onFilters(
    patch: Partial<Pick<AccountsView, 'types' | 'statuses' | 'currencies'>>,
  ): void;
}

/** The accounts list's search box, its Filter by panel, and the chips for what is filtered. */
export function AccountsToolbar({
  view,
  currencies,
  onSearch,
  onFilters,
}: Props): React.JSX.Element {
  const chips = chipsOf(view, onFilters);
  return (
    <div className="px-5 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-[260px]">
          <MagnifyingGlass
            aria-hidden="true"
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            aria-label="Search accounts"
            placeholder="Search by name or broker"
            value={view.q}
            onChange={(e) => onSearch(e.target.value)}
            className={`${INPUT} pl-9`}
          />
        </div>
        <Popover.Root>
          <Popover.Trigger className={TRIGGER}>
            <FunnelSimple size={16} aria-hidden="true" className="text-faint" />
            Filter by
            {chips.length > 0 ? (
              <span className="text-accent-ink tabular-nums">
                {chips.length}
              </span>
            ) : null}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              collisionPadding={12}
              className="z-[60] max-h-(--radix-popover-content-available-height) w-[240px] origin-(--radix-popover-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
            >
              <Group<AccountType>
                title="Type"
                options={ACCOUNT_TYPES}
                on={view.types}
                onChange={(types) => onFilters({ types })}
              />
              <Group<AccountStatus>
                title="Status"
                options={STATUS_LABELS}
                on={view.statuses}
                onChange={(statuses) => onFilters({ statuses })}
              />
              {currencies.length > 1 ? (
                <Group<string>
                  title="Currency"
                  options={currencies.map((c) => ({ value: c, label: c }))}
                  on={view.currencies}
                  onChange={(next) => onFilters({ currencies: next })}
                />
              ) : null}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {chips.length > 0 ? (
        <ul aria-label="Filters" className="mt-2.5 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                aria-label={`Clear filter ${c.text}`}
                onClick={c.clear}
                className="inline-flex h-[26px] items-center gap-1 rounded-full bg-sunken pr-1.5 pl-2.5 text-[12.5px] font-[550] text-muted outline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:pr-3"
              >
                {c.text}
                <X size={12} weight="bold" aria-hidden="true" />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() =>
                onFilters({ types: [], statuses: [], currencies: [] })
              }
              className="inline-flex h-[26px] items-center rounded-full px-2 text-[12.5px] font-semibold text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
            >
              Clear all filters
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
