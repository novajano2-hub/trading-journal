'use client';

import { CaretUpDown, Check, Wallet } from '@phosphor-icons/react/dist/ssr';
import { DropdownMenu } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { IconTile } from '@/components/ui/icon-tile';
import {
  useAccounts,
  useActiveWorkspace,
  useSetActiveWorkspace,
  useWorkspaces,
} from '@/data/query/hooks';
import { useShownFilters } from './use-shown-filters';
import {
  accountSummary,
  switchWorkspaceFilters,
  toggleId,
} from './filter-model';

const ITEM =
  'relative flex min-h-9 cursor-pointer items-center rounded-chip py-1.5 pr-2 pl-8 text-sm text-text select-none data-highlighted:bg-sunken data-disabled:cursor-default data-disabled:opacity-50 pointer-coarse:min-h-11';
const LABEL = 'px-2 pt-1.5 pb-1 text-xs text-faint';

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
 * place and the menu stays open.
 */
export function AccountSwitcher(): React.JSX.Element {
  const { filters, shown: clean, setFilters } = useShownFilters();
  const workspaces = useWorkspaces().data ?? [];
  const active = useActiveWorkspace().data;
  const accounts = useAccounts().data;
  const setActive = useSetActiveWorkspace();
  const workspaceLabel = useId();

  if (!active) {
    return (
      <div
        aria-hidden="true"
        className="h-12 rounded-control border border-line"
      />
    );
  }

  const selected = clean?.accountIds ?? [];
  // Until the accounts load the summary can't name one; an empty filter is still "All accounts".
  const summary =
    clean && accounts
      ? accountSummary(accounts, clean)
      : filters.accountIds.length === 0
        ? 'All accounts'
        : '\u00a0';
  const live = (accounts ?? []).filter((a) => a.status === 'active');
  const archived = (accounts ?? []).filter((a) => a.status === 'archived');
  const writeAccounts = (accountIds: string[]) => {
    if (clean) setFilters({ ...clean, accountIds });
  };

  const accountItem = (id: string, name: string) => (
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
    </DropdownMenu.CheckboxItem>
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="flex h-12 w-full items-center gap-2 rounded-control border border-line bg-surface-1 py-2 pr-2 pl-1.5 text-left transition-colors duration-120 hover:border-line-2 data-[state=open]:border-line-2">
        <IconTile icon={Wallet} tone="accent" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] leading-[1.3] font-medium text-text">
            {active.name}
          </span>
          <span className="truncate text-xs leading-[1.3] text-faint">
            {summary}
          </span>
        </span>
        <CaretUpDown
          size={14}
          aria-hidden="true"
          className="flex-none text-faint"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-[60] max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-60 origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-control border border-line-2 bg-surface-1 p-1.5 text-text shadow-[var(--shadow-chip)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
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
            {live.map((a) => accountItem(a.id, a.name))}
            {accounts && accounts.length === 0 ? (
              <p className="px-2 py-1.5 text-[13px] text-muted">
                No accounts yet.
              </p>
            ) : null}
          </LabelledGroup>
          {archived.length > 0 ? (
            <LabelledGroup label="Archived">
              {archived.map((a) => accountItem(a.id, a.name))}
            </LabelledGroup>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
