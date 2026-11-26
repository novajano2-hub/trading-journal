'use client';

import {
  Camera,
  Copy,
  DownloadSimple,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog } from 'radix-ui';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { UNIT_WORDS } from '@/content/display-units';
import type { calendarMonth } from '@/data/calendar';
import { useGlobalFilters } from '@/data/query/derived';
import { useAccounts, useActiveWorkspace, usePrefs } from '@/data/query/hooks';
import type { CalendarStat } from '@/domain/types';
import { resolveTheme } from '@/lib/appearance';
import {
  calendarFileName,
  calendarPng,
  calendarSvg,
  canCopyImage,
  svgDataUrl,
  svgSize,
} from '@/lib/calendar-image';
import { useDisplay } from '@/lib/display';
import { enter, exit } from '@/lib/motion';
import { onTradingDate } from '@/lib/time-format';
import { usePhone } from '@/lib/use-phone';
import { accountSummary } from '../filter-model';
import { TEXT_BUTTON } from './calendar-controls';
import type { FormatMoney } from './month-grid';

/*
 * The Calendar image (#49, C43 to C46): a Snapshot button in a month's header
 * and the panel it opens, with the picture of the month as shown, Download and
 * Copy. The panel anchors bottom right on a wide screen and is a bottom sheet
 * on a phone; it does not hold the page, so a stat switched on behind it
 * changes the picture. The style-image action is not built (C43).
 */

/** Saves the file the way a link would. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // The browser has the file by then; the address is not needed any longer.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Download image: on a phone or tablet (a coarse pointer) whose browser can
 * share a PNG, the device's share sheet takes the file (save to Photos or Files,
 * or send it on); everywhere else, and if the sheet fails, it is saved as a
 * link would. Closing the sheet is the visitor's choice, not a failure.
 */
async function saveImage(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: 'image/png' });
  if (
    matchMedia('(pointer: coarse)').matches &&
    typeof navigator.share === 'function' &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  download(blob, name);
}

const PANEL =
  'fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col overflow-y-auto rounded-t-[20px] border border-b-0 border-line bg-surface-1 px-5 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[var(--shadow)] outline-none sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[400px] sm:rounded-card sm:border-b sm:p-5';

/**
 * The panel: the preview, Download image, Copy image (a line in its place
 * where the browser can't copy images, C46), a close control. It makes the PNG
 * when it opens and again whenever `svg` changes; while that runs the preview
 * is a skeleton, and a failure says so with Try again.
 */
export function SnapshotPanel({
  open,
  onClose,
  month,
  monthName,
  unit,
  svg,
  returnFocus,
}: {
  open: boolean;
  onClose(): void;
  /** `YYYY-MM`, for the file's name. */
  month: string;
  /** "November 2026". */
  monthName: string;
  /** How the figures read, for the caption: "in dollars". */
  unit: string;
  svg: string;
  /** Where focus goes when the panel closes: the Snapshot button. */
  returnFocus: RefObject<HTMLElement | null>;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const phone = usePhone();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${attempt}|${svg}`;
  const [made, setMade] = useState<{ key: string; blob: Blob | null }>();
  useEffect(() => {
    if (!open) return;
    let live = true;
    calendarPng(svg).then(
      (blob) => live && setMade({ key, blob }),
      () => live && setMade({ key, blob: null }),
    );
    return () => {
      live = false;
    };
  }, [open, key, svg]);
  const current = made?.key === key ? made : undefined;
  const blob = current?.blob ?? null;
  const status = current === undefined ? 'making' : blob ? 'ready' : 'failed';

  // What the last Copy came to, for the picture it was made from.
  const [copied, setCopied] = useState<{
    of: Blob;
    result: 'copied' | 'failed';
  }>();
  const copyResult = copied?.of === blob ? copied.result : undefined;
  const copyable = open && canCopyImage();
  const copy = async (of: Blob) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': of })]);
      setCopied({ of, result: 'copied' });
    } catch {
      setCopied({ of, result: 'failed' });
    }
  };

  const file = calendarFileName(month);
  const size = svgSize(svg);
  return (
    <Dialog.Root
      open={open}
      modal={false}
      onOpenChange={(next) => !next && onClose()}
    >
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Content
              asChild
              forceMount
              onOpenAutoFocus={(e) => {
                // Land on the title, which names the panel: the close control is a tab away.
                e.preventDefault();
                titleRef.current?.focus();
              }}
              // The calendar behind stays in use: a click or focus there leaves the panel open.
              onInteractOutside={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                returnFocus.current?.focus();
              }}
            >
              <motion.div
                className={PANEL}
                initial={
                  reduced
                    ? { opacity: 0 }
                    : phone
                      ? { y: '100%' }
                      : { opacity: 0, y: 12 }
                }
                animate={{
                  ...(reduced ? {} : { y: 0 }),
                  opacity: 1,
                  transition: enter,
                }}
                exit={{
                  ...(reduced ? {} : phone ? { y: '100%' } : { y: 12 }),
                  opacity: phone && !reduced ? 1 : 0,
                  transition: exit,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <Dialog.Title
                    ref={titleRef}
                    tabIndex={-1}
                    className="text-[16px] leading-snug font-semibold tracking-[-0.015em] text-text outline-none"
                  >
                    Calendar image
                  </Dialog.Title>
                  <Dialog.Close
                    aria-label="Close"
                    className="-mt-2 -mr-2 inline-grid size-11 flex-none place-items-center rounded-control text-muted outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <X size={18} aria-hidden="true" />
                  </Dialog.Close>
                </div>

                {status === 'failed' ? (
                  <div
                    role="alert"
                    className="mt-1 rounded-[12px] border border-line bg-sunken p-4"
                  >
                    <p className="text-[14px] font-semibold text-text">
                      Couldn&apos;t make the image
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      Drawing the month did not work. Try again.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3"
                      onClick={() => setAttempt((n) => n + 1)}
                    >
                      Try again
                    </Button>
                  </div>
                ) : (
                  <div className="mt-1 overflow-hidden rounded-[12px] border border-line bg-sunken p-2.5">
                    {status === 'ready' ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a picture made here, as a data address: nothing for next/image to fetch or resize
                      <img
                        src={svgDataUrl(svg)}
                        width={size.width}
                        height={size.height}
                        alt={`Preview of the ${monthName} calendar image`}
                        className="block h-auto w-full rounded-[6px]"
                      />
                    ) : (
                      <div
                        data-testid="snapshot-skeleton"
                        role="status"
                        aria-label="Making the image"
                        style={{
                          aspectRatio: `${size.width} / ${size.height}`,
                        }}
                        className="w-full animate-pulse rounded-[6px] bg-line"
                      />
                    )}
                  </div>
                )}

                <Dialog.Description className="pt-2.5 text-[12.5px] leading-snug text-muted">
                  {monthName} as shown: your chosen stats, {unit}. {file}
                </Dialog.Description>

                {status === 'failed' ? null : (
                  <div className="mt-4 flex gap-2.5">
                    <Button
                      className="flex-1"
                      disabled={blob === null}
                      onClick={() => blob && void saveImage(blob, file)}
                    >
                      <DownloadSimple size={16} aria-hidden="true" />
                      Download image
                    </Button>
                    {copyable ? (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        disabled={blob === null}
                        onClick={() => blob && void copy(blob)}
                      >
                        <Copy size={16} aria-hidden="true" />
                        Copy image
                      </Button>
                    ) : null}
                  </div>
                )}
                {status === 'failed' ? null : copyable ? (
                  <p
                    role="status"
                    className="mt-2.5 text-[12.5px] leading-snug text-muted empty:hidden"
                  >
                    {copyResult === 'copied'
                      ? 'Copied to the clipboard.'
                      : copyResult === 'failed'
                        ? "Couldn't copy the image. Download saves or shares the file."
                        : null}
                  </p>
                ) : (
                  <p className="mt-2.5 text-[12.5px] leading-snug text-muted">
                    This browser can&apos;t copy images. Download saves or
                    shares the file.
                  </p>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** The Snapshot button: a camera, with its word from `sm`; a phone gets the camera and the label. */
export function SnapshotButton({
  open,
  onClick,
  ref,
}: {
  open: boolean;
  onClick(): void;
  ref?: RefObject<HTMLButtonElement | null>;
}): React.JSX.Element {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Snapshot"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={onClick}
      className={`${TEXT_BUTTON} max-sm:w-[30px] max-sm:justify-center max-sm:px-0 pointer-coarse:max-sm:w-11 ${open ? 'border-accent/60 text-accent-ink' : ''}`}
    >
      <Camera
        size={15}
        aria-hidden="true"
        className={open ? 'text-accent-ink' : 'text-faint'}
      />
      <span className="max-sm:hidden">Snapshot</span>
    </button>
  );
}

/**
 * The Snapshot button and its panel, for a month as a calendar shows it: the
 * Calendar page's and the dashboard's advanced calendar share it. The picture
 * is the grid's own data, its cell stats, the display unit and Privacy, the
 * appearance, and the workspace and accounts in words.
 */
export function CalendarSnapshot({
  month,
  data,
  stats,
  fmt,
}: {
  /** `YYYY-MM`. */
  month: string;
  data: ReturnType<typeof calendarMonth>;
  stats: readonly CalendarStat[];
  fmt: FormatMoney;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const prefs = usePrefs().data;
  const display = useDisplay();
  const workspace = useActiveWorkspace().data;
  const accounts = useAccounts().data;
  const { filters } = useGlobalFilters();

  const monthName = onTradingDate(
    `${month}-01`,
    { month: 'long', year: 'numeric' },
    'en-US',
  );
  const built = open
    ? calendarSvg(data, {
        stats,
        fig: (money, r, units) => fmt(money, r, false, units).text,
        theme: resolveTheme(
          prefs?.appearance ?? 'system',
          typeof matchMedia === 'function' &&
            matchMedia('(prefers-color-scheme: dark)').matches,
        ),
        title: monthName,
        subtitle: [
          workspace?.name ?? 'Keel',
          (accounts
            ? accountSummary(accounts, filters)
            : 'All accounts'
          ).replace(/^All accounts$/, 'all accounts'),
        ].join(', '),
        basis: prefs?.pnlBasis ?? 'net',
      })
    : undefined;
  // The picture stays while the panel leaves.
  const [held, setHeld] = useState('');
  if (built !== undefined && built !== held) setHeld(built);

  return (
    <>
      <SnapshotButton
        ref={button}
        open={open}
        onClick={() => setOpen((was) => !was)}
      />
      {held === '' ? null : (
        <SnapshotPanel
          open={open}
          onClose={() => setOpen(false)}
          month={month}
          monthName={monthName}
          unit={UNIT_WORDS[display.unit]}
          svg={built ?? held}
          returnFocus={button}
        />
      )}
    </>
  );
}
