'use client';

import {
  ArrowSquareOut,
  File as FileIcon,
  FileCsv,
  FilePdf,
  FileText,
  FileZip,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react/dist/ssr';
import { useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { useAddFile, useFiles, useRemoveFile } from '@/data/query/hooks';
import { FileRejected, IMAGE_TYPES, SHOT_MAX_BYTES } from '@/data/repository';
import type { StoredFile, Trade } from '@/domain/types';
import { formatBytes, plural } from '@/lib/format';
import { Caption, CARD, CARD_PAD, CardHeader } from '../dashboard/shared';
import { ConfirmDialog, ConfirmFailure } from '../confirm-dialog';
import { FileViewer, useFileUrl } from './file-viewer';

const isImage = (f: Pick<StoredFile, 'type'>) =>
  (IMAGE_TYPES as readonly string[]).includes(f.type);

/** Types a browser shows without running anything of the file's own. Everything else is saved to disk. */
const INLINE = new Set(['application/pdf', 'text/plain']);

/**
 * Opens a file the way a browser opens a download: a PDF or plain text in a new
 * tab, anything else (a page, a vector drawing) saved, never opened under the
 * app's own origin where its scripts could reach the journal.
 */
function openFile(file: StoredFile): void {
  const url = URL.createObjectURL(new Blob([file.bytes], { type: file.type }));
  if (INLINE.has(file.type)) {
    window.open(url, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
  }
  // The tab or the download has its own copy by then.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A glyph for the kind of file: a PDF, a table, an archive, text, or any other. */
function FileGlyph({ file }: { file: StoredFile }): React.JSX.Element {
  const name = file.name.toLowerCase();
  const props = {
    size: 18,
    'aria-hidden': true,
    className: 'flex-none text-muted',
  } as const;
  if (file.type === 'application/pdf' || name.endsWith('.pdf'))
    return <FilePdf {...props} />;
  if (file.type === 'text/csv' || name.endsWith('.csv'))
    return <FileCsv {...props} />;
  if (/zip|compressed/.test(file.type) || /\.(zip|gz|7z|rar)$/.test(name))
    return <FileZip {...props} />;
  if (file.type.startsWith('text/')) return <FileText {...props} />;
  return <FileIcon {...props} />;
}

function Thumb({
  file,
  onOpen,
}: {
  file: StoredFile;
  onOpen(button: HTMLButtonElement): void;
}): React.JSX.Element {
  const url = useFileUrl(file);
  return (
    <button
      type="button"
      aria-label={`Open image, ${file.name}`}
      onClick={(e) => onOpen(e.currentTarget)}
      className="block aspect-[200/124] overflow-hidden rounded-[10px] border border-line bg-sunken shadow-[var(--shadow-card)] outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : null}
    </button>
  );
}

function FileRow({
  file,
  readOnly,
  onDelete,
}: {
  file: StoredFile;
  readOnly: boolean;
  onDelete(): void;
}): React.JSX.Element {
  return (
    <li className="flex min-h-12 items-center gap-2.5 border-t border-line/70 text-[13.5px]">
      <FileGlyph file={file} />
      {/* On a phone the size sits under the name, so a long name keeps its room. */}
      <div className="min-w-0 flex-1 py-1.5 sm:flex sm:items-center sm:gap-2.5 sm:py-0">
        <span
          className="block truncate font-medium sm:min-w-0 sm:flex-1"
          title={file.name}
        >
          {file.name}
        </span>
        <span className="block text-[12.5px] whitespace-nowrap text-faint tabular-nums sm:flex-none">
          {formatBytes(file.size)}
        </span>
      </div>
      <button
        type="button"
        aria-label={`Open ${file.name}`}
        onClick={() => openFile(file)}
        className={`${buttonClasses('ghost', 'sm')} flex-none gap-1.5 px-2 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`}
      >
        <ArrowSquareOut size={16} aria-hidden="true" />
        Open
      </button>
      {readOnly ? null : (
        <button
          type="button"
          aria-label={`Delete ${file.name}`}
          onClick={onDelete}
          className="-mr-1.5 inline-grid size-8 flex-none place-items-center rounded-control text-muted outline-offset-2 hover:bg-sunken hover:text-loss focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
        >
          <Trash size={16} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

/**
 * A trade's attachments (B30): charts, screenshots or any file, 10 MB each, no
 * count cap, in upload order. Images are thumbnails that open a viewer which
 * steps through them; other files are named rows with their size and an Open.
 * There are no captions. A file Keel refuses says why; a full browser store
 * says "Couldn't save". Deleting asks first. A trade on an archived account
 * only shows and opens its files.
 */
export function TradeFiles({
  trade,
  readOnly,
}: {
  trade: Trade;
  readOnly: boolean;
}): React.JSX.Element {
  const owner = `trade:${trade.id}`;
  const files = useFiles(owner).data ?? [];
  const add = useAddFile();
  const remove = useRemoveFile();
  const picker = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  // Enters minus leaves: a pointer crossing into a child leaves the zone and enters again.
  const depth = useRef(0);
  const nextProblem = useRef(0);
  const refocus = useRef(false);
  const [problems, setProblems] = useState<{ id: number; text: string }[]>([]);
  const [over, setOver] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<StoredFile | null>(null);

  const images = files.filter(isImage);
  const others = files.filter((f) => !isImage(f));

  const take = async (list: File[]) => {
    const out: { id: number; text: string }[] = [];
    const problem = (text: string) =>
      out.push({ id: nextProblem.current++, text });
    setProblems([]);
    for (const file of list) {
      if (file.size > SHOT_MAX_BYTES) {
        problem(`${file.name} is over 10 MB.`);
        continue;
      }
      try {
        await add.mutateAsync({
          owner,
          file: {
            bytes: await file.arrayBuffer(),
            type: file.type,
            name: file.name,
          },
          images: false,
        });
      } catch (e) {
        problem(
          e instanceof FileRejected && e.reason === 'size'
            ? `${file.name} is over 10 MB.`
            : e instanceof FileRejected && e.reason === 'type'
              ? `${file.name} can't be attached.`
              : e instanceof FileRejected
                ? `Couldn't save ${file.name}. This browser has no room left.`
                : `Couldn't save ${file.name}.`,
        );
      }
    }
    setProblems(out);
  };

  return (
    <section
      ref={card}
      tabIndex={-1}
      aria-labelledby="files-h"
      className={`${CARD} ${CARD_PAD} outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`}
    >
      <CardHeader
        headingId="files-h"
        title="Attachments"
        after={
          files.length > 0 ? (
            <Caption>
              {files.length} {plural(files.length, 'file')}
            </Caption>
          ) : undefined
        }
      />
      {images.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {images.map((file, i) => (
            <Thumb
              key={file.id}
              file={file}
              onOpen={(button) => {
                origin.current = button;
                setViewing(i);
              }}
            />
          ))}
        </div>
      ) : null}
      {others.length > 0 ? (
        <ul className="mt-2.5">
          {others.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              readOnly={readOnly}
              onDelete={() => setDeleting(file)}
            />
          ))}
        </ul>
      ) : null}
      {readOnly ? (
        files.length === 0 ? (
          <p className="mt-3 text-[13.5px] text-muted">No attachments.</p>
        ) : null
      ) : (
        <div
          data-dropzone=""
          aria-busy={add.isPending}
          onDragEnter={() => {
            depth.current += 1;
            setOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDragLeave={() => {
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            depth.current = 0;
            setOver(false);
            void take([...e.dataTransfer.files]);
          }}
          className={`mt-2.5 flex flex-col items-center gap-0.5 rounded-[10px] border-[1.5px] border-dashed p-4 text-center ${over ? 'border-accent bg-accent-soft' : 'border-line-2'}`}
        >
          <UploadSimple
            size={28}
            aria-hidden="true"
            className="mb-1 text-faint"
          />
          <b className="text-[14px] font-semibold">Drop files here</b>
          <span className="mb-2 text-[12.5px] text-faint">
            Images show as thumbnails. Up to 10 MB each.
          </span>
          <button
            type="button"
            disabled={add.isPending}
            onClick={() => picker.current?.click()}
            className={`${buttonClasses('secondary', 'sm')} outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60`}
          >
            Choose files
          </button>
          <input
            ref={picker}
            type="file"
            multiple
            aria-label="Attachment files"
            tabIndex={-1}
            className="sr-only"
            onChange={(e) => {
              void take([...(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {problems.length > 0 ? (
        <ul role="alert" className="mt-2 text-[13px] text-loss">
          {problems.map((p) => (
            <li key={p.id}>{p.text}</li>
          ))}
        </ul>
      ) : null}
      <FileViewer
        files={images}
        index={viewing}
        origin={origin}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        onDelete={
          readOnly
            ? undefined
            : async (file) => {
                await remove.mutateAsync({ id: file.id });
                // The thumbnail it grew from may be the one that went: the card takes the focus back.
                origin.current = card.current;
              }
        }
        deleteBody="It is removed from this trade and can't be brought back."
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this file?"
        body="It is removed from this trade and can't be brought back."
        confirmLabel="Delete file"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync({ id: deleting.id });
          } catch {
            throw new ConfirmFailure("Couldn't save. Try again.");
          }
          refocus.current = true;
        }}
        onClose={() => {
          setDeleting(null);
          if (refocus.current) {
            refocus.current = false;
            // After the dialog has handed focus back to a row that is gone.
            setTimeout(() => card.current?.focus(), 0);
          }
        }}
      />
    </section>
  );
}
