'use client';

// Export and import for one note (B40), the same on every note surface. The
// pieces are separate so a surface that already has an overflow menu (the day
// note dialog's "...") can put the items in it: `useNoteTransfer` gives the
// menu items and the parts that must be mounted beside them, and `NoteMenu` is
// the one button with its own menu for the surfaces that have none.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Dialog, DropdownMenu } from 'radix-ui';
import {
  DownloadSimple,
  FilePdf,
  FileArrowDown,
  UploadSimple,
} from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { usePrefs, useSaveJournalEntry } from '@/data/query/hooks';
import { localDate } from '@/domain/time';
import type { JournalEntry } from '@/domain/types';
import {
  NoteImportRefused,
  exportNote,
  importNote,
  type ExportedNote,
} from './note-export';
import { PrintHost } from './print-host';

const MENU =
  'z-[60] min-w-[210px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
export const NOTE_MENU_ITEM =
  'flex min-h-9 cursor-pointer items-center gap-2 rounded-[8px] px-2.5 text-[13.5px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-sunken pointer-coarse:min-h-11';
const GLYPH =
  'inline-grid size-8 place-items-center rounded-control text-muted outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent data-[state=open]:bg-sunken pointer-coarse:size-11';

export interface NoteTransferOptions {
  /** The note as it stands now: what an export writes. Read when the item is chosen. */
  read(): ExportedNote;
  /** The folder an imported note goes into; none: My notes. */
  folderId?: string;
  /** Opens the note that was just imported (and stored). Without it a dialog says so and links to the note. */
  onImported?(entry: JournalEntry): void;
}

type Notice =
  { kind: 'done'; entry: JournalEntry } | { kind: 'refused'; message: string };

const SAY = 'text-[14px] leading-[1.55] text-muted';

/** The sentence a dialog says after an import. */
function NoticeDialog({
  notice,
  onClose,
}: {
  notice: Notice | null;
  onClose(): void;
}): React.JSX.Element {
  // The words stay while the dialog fades.
  const [shown, setShown] = useState<Notice | null>(notice);
  if (notice && notice !== shown) setShown(notice);
  const n = notice ?? shown;
  const done = n?.kind === 'done';
  return (
    <Dialog.Root open={notice !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-veil" />
        <Dialog.Content
          role={done ? 'dialog' : 'alertdialog'}
          className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-line bg-surface-1 p-6 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=open]:animate-pop-in"
        >
          <Dialog.Title className="text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance">
            {done ? 'Note imported' : "Couldn't import that file"}
          </Dialog.Title>
          <Dialog.Description className={`mt-2 ${SAY}`}>
            {n?.kind === 'done'
              ? `${n.entry.title} is now a note in your Notebook.`
              : n?.message}
          </Dialog.Description>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="secondary">Close</Button>
            </Dialog.Close>
            {n?.kind === 'done' ? (
              <Link
                href={`/app/notebook/${encodeURIComponent(n.entry.id)}`}
                onClick={onClose}
                className="relative inline-flex h-[34px] items-center justify-center rounded-control bg-accent px-[15px] text-[13.5px] font-semibold text-accent-fg hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:h-11"
              >
                Open note
              </Link>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The export and import items of a note, and what has to be mounted beside
 * them: put `items` inside a `DropdownMenu.Content` and render `host` anywhere
 * in the same surface (the print layout, the file chooser, the dialogs).
 */
export function useNoteTransfer({
  read,
  folderId,
  onImported,
}: NoteTransferOptions): { items: React.ReactNode; host: React.ReactNode } {
  const save = useSaveJournalEntry();
  const timeZone = usePrefs().data?.timeZone ?? 'UTC';
  const chooser = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const bringIn = async (file: File) => {
    try {
      const draft = await importNote(file);
      const entry = await save.mutateAsync({
        ...draft,
        date: localDate(new Date().toISOString(), timeZone),
        ...(folderId === undefined ? {} : { folderId }),
      });
      if (onImported) onImported(entry);
      else setNotice({ kind: 'done', entry });
    } catch (e) {
      setNotice({
        kind: 'refused',
        message:
          e instanceof NoteImportRefused
            ? e.message
            : "Keel couldn't save the note. Try again.",
      });
    }
  };

  const items = (
    <>
      <DropdownMenu.Item
        className={NOTE_MENU_ITEM}
        onSelect={() => exportNote(read(), 'pdf')}
      >
        <FilePdf size={15} aria-hidden="true" className="text-muted" />
        Export as PDF
      </DropdownMenu.Item>
      <DropdownMenu.Item
        className={NOTE_MENU_ITEM}
        onSelect={() => exportNote(read(), 'keel')}
      >
        <FileArrowDown size={15} aria-hidden="true" className="text-muted" />
        Export as Keel note
      </DropdownMenu.Item>
      <DropdownMenu.Separator className="my-1 h-px bg-line" />
      <DropdownMenu.Item
        className={NOTE_MENU_ITEM}
        onSelect={() => chooser.current?.click()}
      >
        <UploadSimple size={15} aria-hidden="true" className="text-muted" />
        Import a Keel note
      </DropdownMenu.Item>
    </>
  );

  const host = (
    <>
      <PrintHost />
      <input
        ref={chooser}
        type="file"
        hidden
        accept=".json,application/json"
        aria-label="Keel note file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          // Cleared at once so the same file can be chosen again.
          e.currentTarget.value = '';
          if (file) void bringIn(file);
        }}
      />
      <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
    </>
  );
  return { items, host };
}

/** A button with the note's export and import menu. */
export function NoteMenu({
  className = GLYPH,
  ...options
}: NoteTransferOptions & {
  /** The button's classes; the default is a 32px glyph button. */
  className?: string;
}): React.JSX.Element {
  const { items, host } = useNoteTransfer(options);
  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Export or import"
          className={className}
        >
          <DownloadSimple size={16} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6} className={MENU}>
            {items}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {host}
    </>
  );
}
