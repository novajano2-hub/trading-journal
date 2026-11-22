'use client';

import {
  ArrowClockwise,
  CaretUpDown,
  Check,
  MagnifyingGlass,
  Wallet,
} from '@phosphor-icons/react/dist/ssr';
import { DropdownMenu } from 'radix-ui';
import { useId, useRef, useState, type ReactNode } from 'react';
import { IconTile } from '@/components/ui/icon-tile';
import {
  useAccounts,
  useActiveWorkspace,
  useSetActiveWorkspace,
  useWorkspaces,
} from '@/data/query/hooks';
import { FIELD } from './filter-chip';
import { SwitcherPlaceholder } from './sidebar';
import { useShownFilters } from './use-shown-filters';
import {
  accountSummary,
  switchWorkspaceFilters,
  toggleId,
} from './filter-model';

const ITEM =
  'relative flex min-h-9 cursor-pointer items-center rounded-[8px] py-1.5 pr-2 pl-8 text-[13.5px] text-text select-none data-highlighted:bg-sunken data-disabled:cursor-default data-disabled:opacity-50 pointer-coarse:min-h-11';
const LABEL = 'px-2 pt-2 pb-1 text-[12px] font-medium text-faint';
/**
 * A white card on the canvas, its edge a hairline that firms on hover and
 * while open. Its gaps and the caret's are tight so "Sample workspace" fits
 * whole in the 220px sidebar.
 */
const BOX =
  'flex h-[52px] w-full items-center gap-2 rounded-[12px] border border-line bg-surface-1 py-2 pl-2 text-left shadow-[var(--shadow-chip)] transition-[border-color] duration-200 ease-(--ease-glide) hover:border-line-2';

function Indicator(): React.JSX.Element {
  return (
    <DropdownMenu.ItemIndicator className="absolute left-2 inline-flex">
      <Check size={16} aria-hidden="true" className="text-accent-ink" />
    </DropdownMenu.ItemIndicator>
  );
}

function LabelledGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): React.JSX.Element {
  const id = useId();
  return (
    <DropdownMenu.Group aria-labelledby={id}>
      <DropdownMenu.Label id={id} className={LABEL}>
        {label}
      </DropdownMenu.Label>
      {children}
    </DropdownMenu.Group>
  );
}

/**
 * The sidebar's workspace and account switcher. It reads the URL filters, so
 * it sits inside `<Suspense>`. Picking a workspace clears the account,
 * strategy and tag filters (ids never cross workspaces); accounts toggle in
 * place and the menu stays open. A workspace that can't load says so, and
 * clicking it reloads the page.
 */
export function AccountSwitcher(): React.JSX.Element {
  const { filters, shown: clean, setFilters } = useShownFilters();
  const workspaces = useWorkspaces().data ?? [];
  const activeQuery = useActiveWorkspace();
  const active = activeQuery.data;
  const accounts = useAccounts().data;
  const setActive = useSetActiveWorkspace();
  const workspaceLabel = useId();
  const [query, setQuery] = useState('');
  const list = useRef<HTMLDivElement>(null);

  if (!active && activeQuery.error) {
    return (
      <button
        type="button"
        // Storage that failed to open never recovers in place; a fresh page tries again.
        onClick={() => window.location.reload()}
        // Nothing sits at the right end here: the words take its room.
        className={`${BOX} pr-1`}
      >
        <IconTile icon={ArrowClockwise} tone="neutral" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] leading-[1.25] font-semibold text-text">
            Workspace unavailable
          </span>
          <span className="truncate text-[12px] leading-[1.4] text-muted">
            Try again
          </span>
        </span>
      </button>
    );
  }
  if (!active) {
    return <SwitcherPlaceholder />;
  }

  const selected = clean?.accountIds ?? [];
  // Until the accounts load the summary can't name one; an empty filter is still "All accounts".
  const summary =
    clean && accounts
      ? accountSummary(accounts, clean)
      : filters.accountIds.length === 0
        ? 'All accounts'
        : '\u00a0';
  // The search matches an account's name or its broker.
  const needle = query.trim().toLowerCase();
  const found = (accounts ?? []).filter(
    (a) =>
      needle === '' ||
      a.name.toLowerCase().includes(needle) ||
      a.broker.toLowerCase().includes(needle),
  );
  const live = found.filter((a) => a.status === 'active');
  const archived = found.filter((a) => a.status === 'archived');
  const writeAccounts = (accountIds: string[]) => {
    if (clean) setFilters({ ...clean, accountIds });
  };

  const accountItem = (id: string, name: string, broker: string) => (
    <DropdownMenu.CheckboxItem
      key={id}
      checked={selected.includes(id)}
      disabled={!clean}
      onSelect={(e) => {
        e.preventDefault();
        writeAccounts(toggleId(selected, id));
      }}
      className={ITEM}
    >
      <Indicator />
      <span className="min-w-0 truncate">{name}</span>
      {broker ? (
        <span className="ml-2 min-w-0 flex-none truncate text-[12px] text-faint">
          {broker}
        </span>
      ) : null}
    </DropdownMenu.CheckboxItem>
  );

  return (
    <DropdownMenu.Root onOpenChange={(open) => !open && setQuery('')}>
      <DropdownMenu.Trigger
        className={`${BOX} pr-2 data-[state=open]:border-line-2`}
      >
        <IconTile icon={Wallet} tone="accent" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] leading-[1.25] font-semibold text-text">
            {active.name}
          </span>
          <span className="truncate text-[12px] leading-[1.4] text-faint">
            {summary}
          </span>
        </span>
        {/* The glyph has air of its own inside its box: 4px is enough beside the words. */}
        <CaretUpDown
          size={14}
          aria-hidden="true"
          className="-ml-1 flex-none text-faint"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-60 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
        >
          <DropdownMenu.RadioGroup
            aria-labelledby={workspaceLabel}
            value={active.id}
            onValueChange={(id) => {
              if (id === active.id) return;
              // The promise settles even if this menu unmounts mid-switch (the drawer closing).
              setActive.mutateAsync(id).then(
                () => setFilters(switchWorkspaceFilters(filters)),
                () => {
                  // The mutation keeps its error; the filters stay as they were.
                },
              );
            }}
          >
            <DropdownMenu.Label id={workspaceLabel} className={LABEL}>
              Workspace
            </DropdownMenu.Label>
            {workspaces.map((w) => (
              <DropdownMenu.RadioItem
                key={w.id}
                value={w.id}
                disabled={setActive.isPending}
                className={ITEM}
              >
                <Indicator />
                {w.name}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="-mx-1.5 my-1.5 h-px bg-line" />
          <LabelledGroup label="Accounts">
            {(accounts?.length ?? 0) > 1 ? (
              <div className="relative px-1 pb-1.5">
                <MagnifyingGlass
                  size={14}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-[11px] left-3.5 text-faint"
                />
                <input
                  type="search"
                  aria-label="Search accounts"
                  placeholder="Search accounts"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // The menu would take a typed letter as a jump to an item.
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      list.current
                        ?.querySelector<HTMLElement>(
                          '[role="menuitemcheckbox"]',
                        )
                        ?.focus();
                    }
                    if (e.key !== 'Escape' && e.key !== 'Tab')
                      e.stopPropagation();
                  }}
                  className={`${FIELD} pl-8 text-[13.5px] placeholder:text-faint`}
                />
              </div>
            ) : null}
            <div ref={list}>
              <DropdownMenu.CheckboxItem
                checked={selected.length === 0}
                disabled={!clean}
                onSelect={(e) => {
                  e.preventDefault();
                  writeAccounts([]);
                }}
                className={ITEM}
              >
                <Indicator />
                All accounts
              </DropdownMenu.CheckboxItem>
              {live.map((a) => accountItem(a.id, a.name, a.broker))}
              {accounts && accounts.length === 0 ? (
                <p className="px-2 py-1.5 text-[13px] text-muted">
                  No accounts yet.
                </p>
              ) : null}
              {accounts && accounts.length > 0 && found.length === 0 ? (
                <p className="px-2 py-1.5 text-[13px] text-muted">
                  No accounts match.
                </p>
              ) : null}
            </div>
          </LabelledGroup>
          {archived.length > 0 ? (
            <LabelledGroup label="Archived">
              {archived.map((a) => accountItem(a.id, a.name, a.broker))}
            </LabelledGroup>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
