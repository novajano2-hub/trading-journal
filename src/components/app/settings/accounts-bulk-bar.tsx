'use client';

import { X } from '@phosphor-icons/react/dist/ssr';
import { useId } from 'react';
import { plural } from '@/lib/format';

const BTN =
  'inline-flex h-[30px] items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium whitespace-nowrap text-text outline-offset-2 hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent pointer-coarse:h-11';

/**
 * What can be done to the selected accounts. Each action counts the accounts it
 * applies to: Archive the active ones, Unarchive the archived ones, Delete the
 * ones with no trades. An action with none to act on is left out (Delete stays,
 * off, and says why).
 */
export function AccountsBulkBar({
  selected,
  archivable,
  restorable,
  deletable,
  onArchive,
  onUnarchive,
  onDelete,
  onClear,
}: {
  selected: number;
  archivable: number;
  restorable: number;
  deletable: number;
  onArchive(): void;
  onUnarchive(): void;
  onDelete(): void;
  onClear(): void;
}): React.JSX.Element {
  const whyId = useId();
  return (
    <div
      role="toolbar"
      aria-label={`${selected} ${plural(selected, 'account')} selected`}
      className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-[12px] border border-line bg-surface-1 py-1.5 pr-1.5 pl-3.5 text-[13.5px] text-text shadow-[var(--shadow),0_2px_6px_rgb(18_22_51/0.06)] motion-safe:animate-pop-in"
    >
      <span className="mr-1 inline-flex h-[30px] flex-none items-center border-r border-line pr-3 font-semibold whitespace-nowrap tabular-nums">
        {selected} selected
      </span>
      {archivable > 0 ? (
        <button type="button" className={BTN} onClick={onArchive}>
          Archive {archivable}
        </button>
      ) : null}
      {restorable > 0 ? (
        <button type="button" className={BTN} onClick={onUnarchive}>
          Unarchive {restorable}
        </button>
      ) : null}
      <button
        type="button"
        className={`${BTN} ${deletable > 0 ? 'text-loss' : ''}`}
        disabled={deletable === 0}
        aria-describedby={deletable === 0 ? whyId : undefined}
        onClick={onDelete}
      >
        {deletable > 0 ? `Delete ${deletable}` : 'Delete'}
      </button>
      {deletable === 0 ? (
        <span
          id={whyId}
          className="basis-full px-2.5 pb-1 text-[12.5px] leading-snug text-muted"
        >
          Accounts with trades can&apos;t be deleted. Archive them or clear
          their trades first.
        </span>
      ) : null}
      <button
        type="button"
        aria-label="Clear selection"
        title="Clear selection"
        className="grid size-[30px] place-items-center rounded-[8px] text-faint outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
        onClick={onClear}
      >
        <X size={14} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
