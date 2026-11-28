'use client';

import { useEffect, useRef, useState } from 'react';
import { Warning } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { SHOT_MAX_BYTES } from '@/data/repository';
import type { StoredFileMeta } from '@/domain/types';
import { formatBytes } from '@/lib/format';
import { useFileUrl, useLazyFileUrl } from '../use-file-url';

/** A strategy's photo is a PNG, JPEG or WebP (B48). GIF and SVG are not photos. */
export const PHOTO_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

/** A photo chosen in the form: read into memory, kept until the strategy is saved. */
export interface PhotoDraft {
  name: string;
  type: string;
  bytes: ArrayBuffer;
}

/** What the Photo field holds: nothing, the strategy's stored photo, or a file chosen and not yet saved. */
export type PhotoValue =
  | { kind: 'none' }
  | { kind: 'stored'; file: StoredFileMeta }
  | { kind: 'chosen'; file: PhotoDraft };

/** Why a file cannot be a strategy's photo, or null when it can. */
export function photoProblem(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!PHOTO_TYPES.includes(file.type))
    return `${file.name} isn't a PNG, JPEG or WebP image.`;
  if (file.size > SHOT_MAX_BYTES) return `${file.name} is over 10 MB.`;
  return null;
}

const FRAME =
  'relative block aspect-[240/132] w-[168px] flex-none overflow-hidden rounded-[10px] border border-line bg-sunken max-sm:w-[120px]';

/** The picture of a stored file, in the field's frame. */
function StoredThumb({ id }: { id: string }): React.JSX.Element {
  const { url } = useFileUrl(id);
  return (
    <span className={FRAME}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
        <img
          src={url}
          alt=""
          draggable={false}
          className="size-full object-contain"
        />
      ) : null}
    </span>
  );
}

/** The picture of a file chosen in the form: an object URL, made for the image and revoked when it goes. */
function DraftThumb({ file }: { file: PhotoDraft }): React.JSX.Element {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const made = URL.createObjectURL(
      new Blob([file.bytes], { type: file.type }),
    );
    if (image.current) image.current.src = made;
    return () => URL.revokeObjectURL(made);
  }, [file]);
  return (
    <span className={FRAME}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise */}
      <img
        ref={image}
        alt=""
        draggable={false}
        className="size-full object-contain"
      />
    </span>
  );
}

/**
 * The strategy form's Photo (B48): PNG, JPEG or WebP up to 10 MB, chosen or
 * dropped on the field (spec §5.7), with Replace and Remove; a drop on a field
 * with a photo replaces it. What is chosen stays in the form until the
 * strategy is saved. A
 * photo already stored may be of any image type (a template's own SVG cover):
 * it shows, and it can be replaced or removed, but a new upload is never SVG
 * or GIF.
 */
export function PhotoField({
  value,
  onChange,
  loading = false,
}: {
  value: PhotoValue;
  onChange(next: PhotoValue): void;
  /** The stored photo's details have not loaded yet. */
  loading?: boolean;
}): React.JSX.Element {
  const picker = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The drop zone (spec §5.7): lit while a file is over it. Entering a child
  // fires before leaving the parent, so a count keeps it lit across them.
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const take = async (file: File | undefined) => {
    if (!file) return;
    const refused = photoProblem(file);
    if (refused) return setProblem(refused);
    try {
      const bytes = await file.arrayBuffer();
      setProblem(null);
      onChange({
        kind: 'chosen',
        file: { name: file.name, type: file.type, bytes },
      });
    } catch {
      setProblem(`Couldn't read ${file.name}.`);
    }
  };

  const shown =
    value.kind === 'stored'
      ? {
          name: value.file.name,
          size: value.file.size,
          thumb: <StoredThumb id={value.file.id} />,
        }
      : value.kind === 'chosen'
        ? {
            name: value.file.name,
            size: value.file.bytes.byteLength,
            thumb: <DraftThumb file={value.file} />,
          }
        : null;

  return (
    <fieldset>
      <legend className="mb-1.5 block text-[12.5px] font-medium text-muted">
        Photo
      </legend>
      <div
        data-dropzone=""
        data-over={over ? '' : undefined}
        onDragEnter={() => {
          if (loading) return;
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
          if (loading) return;
          void take(e.dataTransfer.files[0]);
        }}
        className={`-m-1.5 flex items-center gap-3.5 rounded-[12px] p-1.5 outline-offset-0 transition-colors duration-200 ease-(--ease-glide) max-sm:items-start motion-reduce:transition-none ${over ? 'bg-accent-soft outline-[1.5px] outline-accent outline-dashed' : ''}`}
      >
        {loading ? (
          <span
            className={`${FRAME} motion-safe:animate-pulse`}
            aria-hidden="true"
          />
        ) : shown ? (
          shown.thumb
        ) : null}
        <div className="min-w-0">
          {shown ? (
            <>
              <b className="block text-[13.5px] font-semibold break-words text-text">
                {shown.name}
              </b>
              <span className="block text-[12.5px] text-faint tabular-nums">
                {formatBytes(shown.size)}
              </span>
            </>
          ) : null}
          <div className={`flex flex-wrap gap-1.5 ${shown ? 'mt-2' : ''}`}>
            {shown ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label="Replace photo"
                  onClick={() => picker.current?.click()}
                >
                  Replace
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove photo"
                  onClick={() => {
                    setProblem(null);
                    onChange({ kind: 'none' });
                  }}
                >
                  Remove
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                disabled={loading}
                onClick={() => picker.current?.click()}
              >
                Add a photo
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={picker}
        type="file"
        accept={PHOTO_TYPES.join(',')}
        aria-label="Photo file"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <p className="mt-2 text-[12.5px] leading-[1.45] text-faint">
        PNG, JPEG or WebP, up to 10 MB. It shows as a band on the
        strategy&apos;s card and page.
      </p>
      <div aria-live="polite">
        {problem ? (
          <p
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-[13px] text-text"
          >
            <Warning size={14} aria-hidden="true" className="text-muted" />
            {problem}
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

/** A photo wider than this reads as a banner and fills its band; a squarer one is shown whole. */
const BANNER_RATIO = 2.4;

/**
 * A strategy's photo as a band (B48): the top of its card, or its page's
 * header. `className` gives the band its place and size. Nothing draws for a
 * strategy without a photo or one whose file is gone. The image waits until it
 * is near the viewport, and a banner fills the band while a squarer picture,
 * such as a template's cover, is shown whole on the sunken ground.
 */
export function PhotoBand({
  photoId,
  name,
  className,
}: {
  photoId: string | undefined;
  /** The strategy's name, for the photo's own. */
  name: string;
  className: string;
}): React.JSX.Element | null {
  const { url, status, ref } = useLazyFileUrl<HTMLDivElement>(photoId);
  const [banner, setBanner] = useState(false);
  if (photoId === undefined || status === 'missing' || status === 'error')
    return null;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${name}'s photo`}
      className={`overflow-hidden border-b border-line bg-sunken ${className}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) =>
            setBanner(
              e.currentTarget.naturalWidth >=
                BANNER_RATIO * e.currentTarget.naturalHeight,
            )
          }
          className={`block size-full ${banner ? 'object-cover' : 'object-contain'}`}
        />
      ) : null}
    </div>
  );
}
