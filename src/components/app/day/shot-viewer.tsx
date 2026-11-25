'use client';

import { ArrowLeft, ArrowRight, Trash } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { MorphDialog } from '@/components/ui/morph-dialog';
import type { DayShot } from '@/domain/types';

/** A shot's bytes as an object URL, made when it shows and revoked when it goes. */
export function useShotUrl(shot: DayShot | undefined): string | undefined {
  const id = shot?.id;
  // A refetch gives the same shot new bytes; the URL follows the shot, not them.
  const latest = useRef(shot);
  useEffect(() => {
    latest.current = shot;
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
 * The shots one at a time, full size, with Previous and Next. Delete asks the
 * card to confirm (a finished day has no Delete).
 */
export function ShotViewer({
  shots,
  index,
  origin,
  readOnly,
  onIndex,
  onClose,
  onDelete,
}: {
  shots: readonly DayShot[];
  /** The shot showing; null while closed. */
  index: number | null;
  origin: RefObject<HTMLElement | null>;
  readOnly: boolean;
  onIndex(next: number): void;
  onClose(): void;
  onDelete(shot: DayShot): void;
}): React.JSX.Element {
  const open = index !== null;
  // Keep the last position while the dialog plays its exit.
  const [last, setLast] = useState(0);
  if (index !== null && index !== last) setLast(index);
  const at = Math.min(index ?? last, Math.max(shots.length - 1, 0));
  const shot = shots[at];
  const url = useShotUrl(open ? shot : undefined);
  return (
    <MorphDialog
      open={open && shot !== undefined}
      onOpenChange={(o) => !o && onClose()}
      origin={origin}
      returnFocus={origin}
      title={`Screenshot ${at + 1} of ${shots.length}`}
      size="full"
      footer={
        <div className="flex flex-wrap items-center gap-2 py-3">
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
            disabled={at >= shots.length - 1}
            onClick={() => onIndex(at + 1)}
          >
            Next
            <ArrowRight size={14} aria-hidden="true" />
          </button>
          {readOnly || !shot ? null : (
            <button
              type="button"
              className={`${STEP} ml-auto text-loss`}
              onClick={() => onDelete(shot)}
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
            alt={shot?.name ?? 'Screenshot'}
            className="max-h-[calc(100dvh-210px)] max-w-full rounded-[10px] object-contain"
          />
        ) : null}
      </div>
    </MorphDialog>
  );
}
