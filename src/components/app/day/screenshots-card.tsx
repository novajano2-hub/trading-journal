'use client';

import { ImageSquare } from '@phosphor-icons/react/dist/ssr';
import { useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import {
  useAddDayShot,
  useDayShots,
  useRemoveDayShot,
} from '@/data/query/hooks';
import { SHOT_MAX_BYTES, ShotRejected } from '@/data/repository';
import type { DayShot } from '@/domain/types';
import { CARD, CARD_PAD, CardHeader } from '../dashboard/shared';
import { ConfirmDialog, ConfirmFailure } from '../confirm-dialog';
import { ShotViewer, useShotUrl } from './shot-viewer';

const TYPES = ['image/png', 'image/jpeg'];

function Thumb({
  shot,
  index,
  total,
  onOpen,
}: {
  shot: DayShot;
  index: number;
  total: number;
  onOpen(button: HTMLButtonElement): void;
}): React.JSX.Element {
  const url = useShotUrl(shot);
  return (
    <button
      type="button"
      aria-label={`Open screenshot ${index + 1} of ${total}`}
      onClick={(e) => onOpen(e.currentTarget)}
      className="block aspect-[200/116] overflow-hidden rounded-[10px] border border-line bg-sunken shadow-[var(--shadow-card)] outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
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

/**
 * The day's chart screenshots (K27): a drop zone (or Choose files) for PNG or
 * JPEG up to 10 MB, checked before the write, and the thumbnails in upload
 * order. A thumbnail opens the viewer. A finished day only shows them.
 */
export function ScreenshotsCard({
  date,
  readOnly,
}: {
  date: string;
  readOnly: boolean;
}): React.JSX.Element {
  const shots = useDayShots(date).data ?? [];
  const add = useAddDayShot();
  const remove = useRemoveDayShot();
  const picker = useRef<HTMLInputElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const zone = useRef<HTMLDivElement>(null);
  // Enters minus leaves: a pointer crossing into a child leaves the zone and enters again.
  const depth = useRef(0);
  const nextProblem = useRef(0);
  const [problems, setProblems] = useState<{ id: number; text: string }[]>([]);
  const [over, setOver] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<DayShot | null>(null);

  const take = async (files: File[]) => {
    const out: { id: number; text: string }[] = [];
    const problem = (text: string) =>
      out.push({ id: nextProblem.current++, text });
    setProblems([]);
    for (const file of files) {
      if (!TYPES.includes(file.type)) {
        problem(`${file.name} isn't a PNG or JPEG.`);
        continue;
      }
      if (file.size > SHOT_MAX_BYTES) {
        problem(`${file.name} is over 10 MB.`);
        continue;
      }
      try {
        await add.mutateAsync({
          date,
          file: {
            bytes: await file.arrayBuffer(),
            type: file.type,
            name: file.name,
          },
        });
      } catch (e) {
        problem(
          e instanceof ShotRejected && e.reason === 'type'
            ? `${file.name} isn't a PNG or JPEG.`
            : e instanceof ShotRejected && e.reason === 'size'
              ? `${file.name} is over 10 MB.`
              : `Couldn't save ${file.name}.`,
        );
      }
    }
    setProblems(out);
  };

  return (
    <section aria-labelledby="shots-title" className={`${CARD} ${CARD_PAD}`}>
      <CardHeader headingId="shots-title" title="Screenshots" />
      {shots.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {shots.map((shot, i) => (
            <Thumb
              key={shot.id}
              shot={shot}
              index={i}
              total={shots.length}
              onOpen={(button) => {
                origin.current = button;
                setViewing(i);
              }}
            />
          ))}
        </div>
      ) : readOnly ? (
        <p className="mt-3 text-[13.5px] text-muted">No screenshots.</p>
      ) : null}
      {readOnly ? null : (
        <div
          ref={zone}
          tabIndex={-1}
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
          className={`mt-3 flex flex-col items-center gap-1 rounded-[10px] border-[1.5px] border-dashed outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent px-4 py-[18px] text-center ${over ? 'border-accent bg-accent-soft' : 'border-line-2'}`}
        >
          <ImageSquare
            size={28}
            aria-hidden="true"
            className="mb-1 text-faint"
          />
          <b className="text-[14px] font-semibold">
            Drop chart screenshots here
          </b>
          <span className="mb-2 text-[12.5px] text-faint">
            PNG or JPEG, up to 10 MB each.
          </span>
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className={`${buttonClasses('secondary', 'sm')} outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent`}
          >
            Choose files
          </button>
          <input
            ref={picker}
            type="file"
            multiple
            accept="image/png,image/jpeg"
            aria-label="Screenshot files"
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
      <ShotViewer
        shots={shots}
        index={viewing}
        origin={origin}
        readOnly={readOnly}
        onIndex={setViewing}
        onClose={() => setViewing(null)}
        onDelete={setDeleting}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this screenshot?"
        body="It is removed from this day and can't be brought back."
        confirmLabel="Delete screenshot"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync({ id: deleting.id });
          } catch {
            throw new ConfirmFailure("Couldn't save. Try again.");
          }
          if (shots.length <= 1) {
            // The thumbnail the viewer would return to is gone: the drop zone takes the focus.
            origin.current = zone.current;
            setViewing(null);
          }
        }}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}
