'use client';

import {
  ArrowSquareOut,
  CaretDown,
  DotsThree,
  NotePencil,
  Star,
  Trash,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import {
  useJournal,
  usePrefs,
  useTemplates,
  useTrashJournalEntry,
} from '@/data/query/hooks';
import { LockedDayError } from '@/data/repository';
import { isClosed } from '@/domain/trade-status';
import { useDisplay } from '@/lib/display';
import { clock, dayLabel } from '@/lib/time-format';
import { plural, trimmedPercent } from '@/lib/format';
import { usePhone } from '@/lib/use-phone';
import { signTone } from '../../dashboard/shared';
import { LockLine, useDayFinished } from '../../day/day-lock';
import { TemplateMenu } from '../../day/template-menu';
import { findDailyEntry } from '../../notebook/notebook-model';
import type { TemplateSlot } from '../../notes/editor-toolbar';
import type { NoteEditorHandle } from '../../notes/note-editor';
import { useNoteTransfer } from '../../notes/note-menu';
import {
  DayNoteBinding,
  type NoteControl,
  type NoteStatus,
} from '../trade-journal';
import { DayTables, QUICK } from './day-card';
import { useLogEnv } from './log-env';

/*
 * The day note dialog (the record: a modal titled for the day note, from Add
 * note or View note on a day card). Header: a link to the notebook, a star, a
 * "..." menu (export, import, Move to Trash) and close; Template sits in the
 * editor's toolbar. A summary row: the date, the net
 * and "n trades, x% win rate", expanding to the day's trades. The editor, and
 * Save at the bottom right.
 *
 * The record leaves several calls UNKNOWN; Keel's calls are marked where they
 * are made.
 */

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const GHOST =
  'inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-[13px] font-medium text-muted outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent aria-disabled:pointer-events-none aria-disabled:opacity-45 pointer-coarse:h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center';
const GLYPH =
  'inline-grid size-8 place-items-center rounded-control text-muted outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent aria-disabled:pointer-events-none aria-disabled:opacity-45 pointer-coarse:size-11';
const MENU =
  'z-[60] min-w-[200px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const ITEM =
  'flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-[13.5px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-sunken pointer-coarse:min-h-11';

/**
 * The day note for `date`, in a dialog that grows from its opener. Render
 * inside the Day view (it reads the view's day groups and columns). A note
 * is made on the first change, never by looking; autosave writes it as you
 * type; Save writes what is waiting and closes.
 *
 * Keel's call (TradeZella unknown): the record says Save stores the note and is
 * silent on unsaved edits (K43, spec 5.3); Keel's editors autosave.
 */
export function DayNoteDialog({
  date,
  open,
  onOpenChange,
  origin,
}: {
  date: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  origin: React.RefObject<HTMLElement | null>;
}): React.JSX.Element | null {
  const { groups, columns } = useLogEnv();
  const display = useDisplay();
  const journal = useJournal();
  const templates = useTemplates().data;
  const timeZone = usePrefs().data?.timeZone;
  const trash = useTrashJournalEntry();
  const { finished } = useDayFinished(date);
  const panel = useId();
  const handle = useRef<NoteEditorHandle | null>(null);
  const control = useRef<NoteControl | null>(null);
  const lastStatus = useRef<NoteStatus>('idle');
  const [status, setStatus] = useState<NoteStatus>('idle');
  const [expanded, setExpanded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The last write failed because the day was closed meanwhile: nothing can save.
  const lockedOut = useRef(false);
  const [lockedNotice, setLockedNotice] = useState(false);
  // A close left text the store still refuses: offer to let it go.
  const [stuck, setStuck] = useState(false);

  const entry = findDailyEntry(journal.data, date);
  const trashed = entry?.deletedAt !== undefined;
  // A finished day's note is frozen (K3), and a trashed one is read-only until restored (E109).
  const readOnly = finished || trashed;
  const group = groups?.get(date);
  // Export and import read the note as it stands in the editor.
  const transfer = useNoteTransfer({
    read: () => ({
      title: entry?.title ?? `Daily review, ${dayLabel(date)}`,
      tags: entry?.tags ?? [],
      body: handle.current?.getJSON() ?? entry?.body ?? EMPTY_DOC,
    }),
  });

  const onStatus = (s: NoteStatus, error?: unknown) => {
    lastStatus.current = s;
    lockedOut.current = s === 'failed' && error instanceof LockedDayError;
    setLockedNotice(lockedOut.current);
    setStatus(s);
    if (s === 'saved') {
      setProblem(null);
      setStuck(false);
    }
  };

  // Keel's call (TradeZella unknown): the record says Save stores the note and is
  // silent on unsaved edits (K43, spec 5.3); Keel's editors autosave. So closing
  // with unsaved edits (record line 706) neither warns nor discards: closing any
  // way, Save, the X or Escape, writes what is waiting first, and a write that
  // still fails keeps the dialog open with the alert, so no text is lost. Two
  // ways out, so the modal is never a trap: a closed day (the write can never
  // land) closes at once, and after a failed close "Close without saving" lets
  // the waiting text go.
  const close = async (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (!finished) {
      await control.current?.settle();
      if (lastStatus.current === 'failed' && !lockedOut.current) {
        setStuck(true);
        return;
      }
    }
    onOpenChange(false);
  };

  // Keel's call (TradeZella unknown): the star is written in the editor's own
  // queue, behind what is waiting, so an autosave right after builds on the
  // starred note and neither the star nor the text is lost.
  const toggleStar = async () => {
    if (!entry || !control.current) return;
    setProblem(null);
    try {
      await control.current.patch((current) => ({
        favorite: current.favorite !== true,
      }));
    } catch {
      setProblem("Couldn't favourite the note. Try again.");
    }
  };
  // R26, Keel's call (TradeZella unknown): after Move to Trash the dialog stays
  // open, showing the trashed note with Restore (E109), as the day page's note card does.
  const moveToTrash = async () => {
    if (!entry) return;
    setProblem(null);
    try {
      await control.current?.settle();
      // The editor holds text the store refused: stop, with the alert showing,
      // as closing does, rather than trash a note that is not what is on screen.
      if (lastStatus.current === 'failed') return;
      await trash.mutateAsync(entry.id);
    } catch {
      setProblem("Couldn't move the note to Trash. Try again.");
    }
  };

  // The template the note started from; a date with no note yet shows the default it will start from.
  const daily = (templates ?? []).filter((t) => t.kind === 'daily-review');
  const source = daily.find(
    (t) =>
      t.id === (entry ? entry.templateId : daily.find((d) => d.isDefault)?.id),
  );

  // The summary row: the day as the card above reads it (every filter on the page applies).
  const trades = group?.trades.length ?? 0;
  const other = group?.otherCurrency.length ?? 0;
  const noteOnly = trades === 0 && other === 0;
  const net =
    group && group.stats.net !== null
      ? display.figure(
          display.ofTrades(
            group.trades.filter(isClosed).map((t) => t.id),
            group.stats.net,
          ),
        )
      : null;
  const rate = group?.stats.winRate;
  const apart =
    other > 0 ? `${other} in other currencies, listed apart` : undefined;
  const count =
    trades === 0 && other > 0
      ? `${other} ${plural(other, 'trade')} in other currencies, listed apart`
      : [
          `${trades} ${plural(trades, 'trade')}`,
          rate === null || rate === undefined
            ? 'win rate None'
            : `${trimmedPercent(rate)} win rate`,
          apart,
        ]
          .filter((part) => part !== undefined)
          .join(', ');

  const caption =
    status === 'saving'
      ? 'Saving'
      : status === 'failed'
        ? null
        : entry && timeZone !== undefined
          ? `Saved ${clock(entry.updatedAt, timeZone, false)}`
          : null;

  const actions = (
    <>
      {/* Keel's call (TradeZella unknown): the link needs the note, so it waits until there is one (nothing is written by looking). */}
      {entry ? (
        <Link
          href={`/app/notebook/${encodeURIComponent(entry.id)}`}
          className={GHOST}
        >
          <ArrowSquareOut size={16} aria-hidden="true" />
          <span className="max-sm:sr-only">Open in Notebook</span>
        </Link>
      ) : (
        <button
          type="button"
          aria-disabled="true"
          title="Available once the note is saved"
          className={GHOST}
        >
          <ArrowSquareOut size={16} aria-hidden="true" />
          <span className="max-sm:sr-only">Open in Notebook</span>
        </button>
      )}
      {/* Keel's call (TradeZella unknown): a finished day, or a note in Trash, shows no star, as the Notebook's pane does. */}
      {readOnly ? null : (
        <>
          {/* Keel's call (TradeZella unknown): the star needs the note, so it waits until there is one. */}
          <button
            type="button"
            aria-label="Favourite"
            aria-pressed={entry?.favorite === true}
            aria-disabled={entry ? undefined : true}
            title={entry ? undefined : 'Available once the note is saved'}
            onClick={() => void toggleStar()}
            className={`${GLYPH} ${entry?.favorite ? 'text-accent' : ''}`}
          >
            <Star
              size={16}
              weight={entry?.favorite ? 'fill' : 'regular'}
              aria-hidden="true"
            />
          </button>
        </>
      )}
      {/* Keel's call (TradeZella unknown): the "..." menu holds the note's export and import (B40, TradeZella's overflow menu) and Move to Trash; a finished day, or a note in Trash, keeps the export and the import, and has no Move to Trash. */}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label="More" className={GLYPH}>
          <DotsThree size={18} weight="bold" aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={MENU}>
            {transfer.items}
            {readOnly ? null : (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item
                  className={ITEM}
                  disabled={!entry}
                  onSelect={() => void moveToTrash()}
                >
                  <Trash size={15} aria-hidden="true" className="text-muted" />
                  Move to Trash
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </>
  );

  // Insert's neighbour in the editor's toolbar. Keel's call (TradeZella unknown): a finished day, or a note in Trash, takes no template.
  const templateSlot: TemplateSlot | undefined = readOnly
    ? undefined
    : (slot) => (
        <TemplateMenu
          {...slot}
          onPick={(t) => handle.current?.insertContent(structuredClone(t.body))}
        />
      );

  return (
    <>
      <MorphDialog
        open={open}
        onOpenChange={(next) => void close(next)}
        origin={origin}
        returnFocus={origin}
        title="Day note"
        description={`${dayLabel(date, { year: true })}${source ? `, from the ${source.name} template` : ''}`}
        size="sheet"
        actions={actions}
        footer={
          <div className="flex items-center gap-3">
            <span
              aria-live="polite"
              className="min-w-0 truncate text-[12.5px] text-faint"
            >
              {caption}
            </span>
            {status === 'failed' || problem ? (
              <span role="alert" className="min-w-0 text-[12.5px] text-loss">
                {problem ??
                  (lockedNotice
                    ? 'That day was closed, so this note can no longer change.'
                    : "Couldn't save. Press Save to try again.")}
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {stuck && status === 'failed' ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setStuck(false);
                    onOpenChange(false);
                  }}
                >
                  Close without saving
                </Button>
              ) : null}
              {/* Keel's call (TradeZella unknown): with nothing to save (a finished day, a note in Trash) the button reads Done and only closes. */}
              <Button onClick={() => void close(false)}>
                {readOnly ? 'Done' : 'Save'}
              </Button>
            </div>
          </div>
        }
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panel}
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-sunken px-3.5 py-3 text-left text-[13.5px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          <b className="font-semibold text-text">{dayLabel(date)}</b>
          <span
            className={`font-semibold tabular-nums ${net && group ? signTone(group.stats.net!) : 'text-faint'}`}
          >
            {net ? net.text : noteOnly ? display.cash(0, false).text : 'None'}
          </span>
          <span className="text-muted">
            {noteOnly ? 'No trades this day' : count}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-ink">
            {expanded ? 'Hide trades' : 'Show trades'}
            <CaretDown
              size={12}
              weight="bold"
              aria-hidden="true"
              className={expanded ? 'rotate-180' : ''}
            />
          </span>
        </button>
        <div id={panel} hidden={!expanded}>
          {/* Keel's call (TradeZella unknown, record line 701): the expanded summary lists the day as its card does. */}
          {expanded && group ? (
            <DayTables
              group={group}
              date={dayLabel(date, { year: true })}
              columns={columns}
            />
          ) : null}
        </div>
        {finished && !trashed ? <LockLine className="mt-3" /> : null}
        <div className="note-day mt-3 min-w-0">
          <DayNoteBinding
            date={date}
            readOnly={finished}
            handleRef={handle}
            controlRef={control}
            templateSlot={templateSlot}
            onStatus={onStatus}
          />
        </div>
      </MorphDialog>
      {transfer.host}
    </>
  );
}

/**
 * The note action in a day card's header: Add note, or View note once the date
 * has a daily note (a trashed one too, E109: the dialog shows it with
 * Restore; Keel's call, TradeZella unknown). A glyph with the date in its name
 * on a phone. It opens the dialog and gives focus back to itself on close.
 */
export function DayNoteAction({ date }: { date: string }): React.JSX.Element {
  const phone = usePhone();
  const journal = useJournal();
  const [open, setOpen] = useState(false);
  // A card's dialog is built the first time it opens, then kept for its exit.
  const [built, setBuilt] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const label = findDailyEntry(journal.data, date) ? 'View note' : 'Add note';
  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-haspopup="dialog"
        aria-label={
          phone ? `${label} ${dayLabel(date, { year: true })}` : undefined
        }
        onClick={() => {
          setBuilt(true);
          setOpen(true);
        }}
        className={phone ? `${QUICK} w-11 justify-center px-0` : QUICK}
      >
        <NotePencil size={phone ? 20 : 16} aria-hidden="true" />
        {phone ? null : label}
      </button>
      {built ? (
        <DayNoteDialog
          date={date}
          open={open}
          onOpenChange={setOpen}
          origin={opener}
        />
      ) : null}
    </>
  );
}
