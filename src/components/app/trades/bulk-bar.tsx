'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { DropdownMenu, Popover } from 'radix-ui';
import {
  CaretDown,
  DownloadSimple,
  Seal,
  SealCheck,
  StackMinus,
  StackPlus,
  Tag as TagIcon,
  Trash,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { useRemoveTrades, useUpdateTrades } from '@/data/query/hooks';
import { strategyRules, type Strategy, type Trade } from '@/domain/types';
import { plural } from '@/lib/format';
import { ConfirmDialog } from '../confirm-dialog';
import { TagPicker } from '../tag-picker';

const IMPORT_HISTORY = '/app/settings/import-history';

/**
 * Splits a delete: an open trade that came from an import can't be deleted
 * (its import has to be undone), so it is set aside, whatever else is chosen.
 */
export function splitDeletable(trades: readonly Trade[]): {
  deletable: Trade[];
  kept: Trade[];
} {
  const kept = trades.filter(
    (t) => t.status === 'open' && t.importId !== undefined,
  );
  const keptIds = new Set(kept.map((t) => t.id));
  return { deletable: trades.filter((t) => !keptIds.has(t.id)), kept };
}

const BTN =
  'inline-flex h-8 flex-none items-center gap-1.5 rounded-[8px] px-2.5 max-sm:min-w-11 max-sm:justify-center max-sm:px-0 text-[13.5px] font-medium whitespace-nowrap text-text outline-offset-0 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45 data-[state=open]:bg-sunken pointer-coarse:h-11';
const ICON = 'flex-none text-muted';
const MENU =
  'z-[60] max-h-(--radix-dropdown-menu-content-available-height) min-w-[220px] max-w-[320px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const MENU_ITEM =
  'flex min-h-9 cursor-pointer items-center rounded-[8px] px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken pointer-coarse:min-h-11';

function StrategyMenu({
  label,
  icon,
  strategies,
  empty,
  disabled = false,
  onPick,
}: {
  label: string;
  disabled?: boolean;
  icon: React.ReactNode;
  strategies: readonly Strategy[];
  empty: string;
  onPick(s: Strategy): void;
}): React.JSX.Element {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={BTN} title={label} disabled={disabled}>
        {icon}
        <span className="max-sm:sr-only">{label}</span>
        <CaretDown
          size={12}
          aria-hidden="true"
          className="-ml-0.5 flex-none text-faint max-sm:hidden"
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="center"
          sideOffset={8}
          collisionPadding={12}
          className={MENU}
        >
          {strategies.length === 0 ? (
            <p className="px-2.5 py-2 text-[13px] text-faint">{empty}</p>
          ) : (
            strategies.map((s) => (
              <DropdownMenu.Item
                key={s.id}
                className={MENU_ITEM}
                onSelect={() => onPick(s)}
              >
                <span className="truncate">{s.name}</span>
              </DropdownMenu.Item>
            ))
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The floating bar over a selection: add tags, add to or remove from a
 * strategy, mark reviewed, export, delete. Tags are only ever added. Every
 * action reports through `onResult`; a failure says so instead of looking done.
 */
export function BulkBar({
  trades,
  archivedAccountIds,
  strategies,
  onClear,
  onExport,
  onResult,
}: {
  /** The selected trades. */
  trades: readonly Trade[];
  /** Trades of these accounts are read-only: edits and deletes leave them out. */
  archivedAccountIds: ReadonlySet<string>;
  strategies: readonly Strategy[];
  onClear(): void;
  onExport(): void;
  onResult(result: React.ReactNode): void;
}): React.JSX.Element {
  const update = useUpdateTrades();
  const remove = useRemoveTrades();
  const [tagOpen, setTagOpen] = useState(false);
  const [pending, setPending] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  // Read by onClose in the same tick the delete settles, so not state.
  const deleted = useRef(false);

  // Archived accounts are read-only: only the other trades are edited.
  const locked = trades.filter((t) => archivedAccountIds.has(t.accountId));
  const editable = trades.filter((t) => !archivedAccountIds.has(t.accountId));
  const lockedCount = locked.length;
  const lockedSubject = `${lockedCount} ${plural(lockedCount, 'trade')} in ${plural(lockedCount, 'an archived account', 'archived accounts')}`;
  const n = trades.length;
  const ids = editable.map((t) => t.id);
  const noun = `${editable.length} ${plural(editable.length, 'trade')}`;
  const FAILED = "Couldn't save that. Try again.";

  const run = async (
    patch: Parameters<typeof update.mutateAsync>[0]['patch'],
    done: string,
  ) => {
    try {
      if (ids.length > 0) await update.mutateAsync({ ids, patch });
      onResult(
        lockedCount > 0 ? (
          <>
            {ids.length > 0 ? `${done} ` : ''}
            {lockedSubject} {plural(lockedCount, "wasn't", "weren't")} changed.
          </>
        ) : (
          done
        ),
      );
    } catch {
      onResult(FAILED);
    }
  };

  const onStrategies = new Set(trades.flatMap((t) => t.strategyIds));
  const removable = strategies.filter((s) => onStrategies.has(s.id));

  const { deletable, kept } = splitDeletable(editable);

  return (
    <>
      <div
        role="toolbar"
        aria-label={`${n} selected ${plural(n, 'trade')}`}
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-[12px] border border-line bg-surface-1 py-1.5 pr-1.5 pl-3.5 text-[13.5px] text-text shadow-[var(--shadow),0_2px_6px_rgb(18_22_51/0.06)] motion-safe:animate-pop-in"
      >
        <span className="mr-1 inline-flex h-[30px] flex-none items-center gap-2.5 border-r border-line pr-3 font-semibold whitespace-nowrap tabular-nums">
          <span
            aria-hidden="true"
            className="grid size-4 place-items-center rounded-[5px] border border-accent bg-accent"
          >
            <span className="h-0.5 w-2 rounded-[1px] bg-accent-fg" />
          </span>
          {n} selected
        </span>

        <Popover.Root
          open={tagOpen}
          onOpenChange={(next) => {
            setTagOpen(next);
            if (!next) setPending([]);
          }}
        >
          <Popover.Trigger
            className={BTN}
            title="Tag"
            disabled={ids.length === 0}
          >
            <TagIcon size={16} aria-hidden="true" className={ICON} />
            <span className="max-sm:sr-only">Tag</span>
            <CaretDown
              size={12}
              aria-hidden="true"
              className="-ml-0.5 flex-none text-faint max-sm:hidden"
            />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="top"
              align="center"
              sideOffset={8}
              collisionPadding={12}
              className="z-[60] w-[300px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in"
            >
              <TagPicker
                label="Tags to add"
                autoFocus
                selected={pending}
                onChange={setPending}
              />
              <Button
                size="sm"
                className="mt-3 w-full"
                disabled={pending.length === 0}
                onClick={() => {
                  const add = pending;
                  setTagOpen(false);
                  void run(
                    (t) => ({ tagIds: [...new Set([...t.tagIds, ...add])] }),
                    `Tagged ${noun}.`,
                  );
                }}
              >
                {`Add to ${noun}`}
              </Button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <StrategyMenu
          label="Add to strategy"
          icon={<StackPlus size={16} aria-hidden="true" className={ICON} />}
          strategies={strategies}
          empty="No strategies yet."
          disabled={ids.length === 0}
          onPick={(s) =>
            void run(
              (t) => ({ strategyIds: [...new Set([...t.strategyIds, s.id])] }),
              `Added ${noun} to ${s.name}.`,
            )
          }
        />
        <StrategyMenu
          label="Remove from strategy"
          icon={<StackMinus size={16} aria-hidden="true" className={ICON} />}
          strategies={removable}
          empty="None of these trades follows a strategy."
          disabled={ids.length === 0}
          onPick={(s) => {
            const rules = new Set(strategyRules(s).map((r) => r.id));
            void run(
              (t) => ({
                strategyIds: t.strategyIds.filter((id) => id !== s.id),
                // Their checks of this strategy's rules go with it.
                ruleChecks: t.ruleChecks.filter((c) => !rules.has(c.ruleId)),
              }),
              `Removed ${noun} from ${s.name}.`,
            );
          }}
        />

        <button
          type="button"
          className={BTN}
          disabled={ids.length === 0}
          title="Mark reviewed"
          onClick={() =>
            void run({ reviewed: true }, `Marked ${noun} reviewed.`)
          }
        >
          <SealCheck size={16} aria-hidden="true" className={ICON} />
          <span className="max-sm:sr-only">Mark reviewed</span>
        </button>
        <button
          type="button"
          className={BTN}
          disabled={ids.length === 0}
          title="Mark not reviewed"
          onClick={() =>
            void run({ reviewed: false }, `Marked ${noun} not reviewed.`)
          }
        >
          <Seal size={16} aria-hidden="true" className={ICON} />
          <span className="max-sm:sr-only">Mark not reviewed</span>
        </button>
        <button
          type="button"
          className={BTN}
          title="Export CSV"
          onClick={onExport}
        >
          <DownloadSimple size={16} aria-hidden="true" className={ICON} />
          <span className="max-sm:sr-only">Export CSV</span>
        </button>

        <span
          aria-hidden="true"
          className="mx-1 h-[22px] w-px flex-none bg-line"
        />
        <button
          type="button"
          className={BTN}
          disabled={ids.length === 0}
          title="Delete"
          onClick={() => {
            deleted.current = false;
            setConfirming(true);
          }}
        >
          <Trash size={16} aria-hidden="true" className={ICON} />
          <span className="max-sm:sr-only">Delete</span>
        </button>
        <button
          type="button"
          aria-label="Clear selection"
          onClick={onClear}
          className={`${BTN} w-8 justify-center px-0 pointer-coarse:w-11`}
          title="Clear selection"
        >
          <X size={16} aria-hidden="true" className={ICON} />
        </button>
        {lockedCount > 0 ? (
          <p className="w-full px-0.5 pb-0.5 text-[12.5px] text-muted">
            {lockedSubject} won't be changed.
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        danger
        title={`Delete ${noun}? This can't be undone.`}
        confirmLabel="Delete"
        body={
          kept.length > 0 ? (
            <>
              {kept.length} open imported{' '}
              {plural(kept.length, 'trade is', 'trades are')} left out: undo
              their import in{' '}
              <Link
                href={IMPORT_HISTORY}
                className="font-medium text-accent-ink underline underline-offset-2"
              >
                Import history
              </Link>{' '}
              to remove them.
            </>
          ) : (
            'The trades, their notes and their rule checks are removed from this workspace.'
          )
        }
        onConfirm={async () => {
          if (deletable.length > 0)
            await remove.mutateAsync(deletable.map((t) => t.id));
          deleted.current = true;
          const k = kept.length;
          onResult(
            <>
              {deletable.length > 0
                ? `${deletable.length} ${plural(deletable.length, 'trade')} deleted. `
                : ''}
              {k > 0 ? (
                <>
                  {k} open imported {plural(k, 'trade wasn', 'trades weren')}
                  &apos;t deleted. Undo their import in{' '}
                  <Link
                    href={IMPORT_HISTORY}
                    className="font-medium text-accent-ink underline underline-offset-2"
                  >
                    Import history
                  </Link>{' '}
                  to remove them.
                </>
              ) : null}
              {lockedCount > 0 ? (
                <>
                  {k > 0 ? ' ' : ''}
                  {lockedSubject} {plural(lockedCount, "wasn't", "weren't")}{' '}
                  changed.
                </>
              ) : null}
            </>,
          );
        }}
        onClose={() => {
          setConfirming(false);
          if (deleted.current) onClear();
        }}
      />
    </>
  );
}
