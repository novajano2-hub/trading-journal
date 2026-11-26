'use client';

import { ArrowLeft, ArrowRight, Trash } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { MorphDialog } from '@/components/ui/morph-dialog';
import type { StoredFile } from '@/domain/types';
import { ConfirmDialog, ConfirmFailure } from '../confirm-dialog';

/**
 * A stored file's bytes as an object URL, made when it shows and revoked when
 * it goes. A refetch gives the same file new bytes; the URL follows the file.
 */
export function useFileUrl(
  file: Pick<StoredFile, 'id' | 'bytes' | 'type'> | undefined,
): string | undefined {
  const id = file?.id;
  const latest = useRef(file);
  useEffect(() => {
    latest.current = file;
  });
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    const kept = latest.current;
    if (id === undefined || !kept) return;
    const made = URL.createObjectURL(
      new Blob([kept.bytes], { type: kept.type }),
    );
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl(undefined);
    };
  }, [id]);
  return url;
}

const STEP = `${buttonClasses('secondary')} disabled:cursor-not-allowed disabled:opacity-50 outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`;

/**
 * Images one at a time, full size, with Previous and Next (and the arrow
 * keys). Shared by a trade's attachments and, later, a note's images, so it
 * knows nothing of either: the caller gives the images, the position, and, if
 * the reader may delete, `onDelete`. Delete asks first; `onDelete` runs once
 * the reader confirms, and a rejection is said in the confirmation. Deleting
 * the last image closes the viewer.
 */
export function FileViewer({
  files,
  index,
  origin,
  onIndex,
  onClose,
  onDelete,
  deleteBody = "It is deleted and can't be brought back.",
}: {
  files: readonly StoredFile[];
  /** The image showing; null while closed. */
  index: number | null;
  /** The element the dialog grows from and focus returns to. */
  origin: RefObject<HTMLElement | null>;
  onIndex(next: number): void;
  onClose(): void;
  /** Omitted: the reader may not delete, and there is no Delete. */
  onDelete?(file: StoredFile): Promise<void>;
  /** Said under "Delete this image?". */
  deleteBody?: string;
}): React.JSX.Element {
  const open = index !== null;
  // Keep the last position while the dialog plays its exit.
  const [last, setLast] = useState(0);
  if (index !== null && index !== last) setLast(index);
  const at = Math.min(index ?? last, Math.max(files.length - 1, 0));
  const file = files[at];
  const url = useFileUrl(open ? file : undefined);
  const [deleting, setDeleting] = useState<StoredFile | null>(null);

  useEffect(() => {
    if (!open || deleting) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'ArrowLeft' && at > 0) onIndex(at - 1);
      if (e.key === 'ArrowRight' && at < files.length - 1) onIndex(at + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, deleting, at, files.length, onIndex]);

  return (
    <>
      <MorphDialog
        open={open && file !== undefined}
        onOpenChange={(o) => !o && onClose()}
        origin={origin}
        returnFocus={origin}
        title={`Image ${at + 1} of ${files.length}`}
        description={file?.name}
        size="full"
        footer={
          <div className="flex flex-wrap items-center gap-2 py-1">
            <button
              type="button"
              className={STEP}
              disabled={at === 0}
              onClick={() => onIndex(at - 1)}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              className={STEP}
              disabled={at >= files.length - 1}
              onClick={() => onIndex(at + 1)}
            >
              Next
              <ArrowRight size={14} aria-hidden="true" />
            </button>
            {onDelete === undefined || !file ? null : (
              <button
                type="button"
                className={`${STEP} ml-auto text-loss`}
                onClick={() => setDeleting(file)}
              >
                <Trash size={14} aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        }
      >
        <div className="grid min-h-0 flex-1 place-items-center">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
            <img
              src={url}
              alt={file?.name ?? 'Image'}
              className="max-h-[calc(100dvh-230px)] max-w-full rounded-[10px] object-contain"
            />
          ) : null}
        </div>
      </MorphDialog>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this image?"
        body={deleteBody}
        confirmLabel="Delete image"
        danger
        onConfirm={async () => {
          if (!deleting || !onDelete) return;
          try {
            await onDelete(deleting);
          } catch {
            throw new ConfirmFailure("Couldn't save. Try again.");
          }
          if (files.length <= 1) onClose();
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
