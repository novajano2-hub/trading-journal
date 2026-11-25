'use client';

import Link from 'next/link';
import {
  ArrowsClockwise,
  CaretRight,
  PencilSimple,
  UploadSimple,
} from '@phosphor-icons/react/dist/ssr';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { MorphDialog } from '@/components/ui/morph-dialog';

const OPTION =
  'flex min-h-16 w-full items-center gap-3.5 rounded-[12px] border border-line-2 bg-surface-1 px-4 py-2.5 text-left text-text no-underline shadow-[var(--shadow-card)] transition-[border-color] duration-200 ease-(--ease-glide) outline-offset-2 hover:border-accent/45 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-[72px]';

function Words({
  title,
  detail,
}: {
  title: string;
  detail: string;
}): React.JSX.Element {
  return (
    <span className="min-w-0 flex-1">
      <b className="block text-[14px] font-semibold">{title}</b>
      <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-muted">
        {detail}
      </span>
    </span>
  );
}

/**
 * The methods a day's trades come in by, as TradeZella's import modal offers
 * them: a file, a trade by hand, and auto-sync, which isn't live yet (#12).
 */
export function ImportPicker({
  open,
  onOpenChange,
  origin,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The control that opened it, which the dialog grows from and returns to. */
  origin: RefObject<HTMLElement | null>;
}): React.JSX.Element {
  const close = () => onOpenChange(false);
  return (
    <MorphDialog
      open={open}
      onOpenChange={onOpenChange}
      origin={origin}
      returnFocus={origin}
      title="Add the day's trades"
      description="Choose how they come in."
      size="compact"
    >
      <ul className="flex flex-col gap-2 pt-0.5">
        <li>
          <Link href="/app/import" onClick={close} className={OPTION}>
            <UploadSimple
              size={20}
              aria-hidden="true"
              className="flex-none text-muted"
            />
            <Words
              title="Upload a file"
              detail="A CSV or an export from your broker."
            />
            <CaretRight
              size={13}
              weight="bold"
              aria-hidden="true"
              className="flex-none text-faint"
            />
          </Link>
        </li>
        <li>
          <Link href="/app/trades/new" onClick={close} className={OPTION}>
            <PencilSimple
              size={20}
              aria-hidden="true"
              className="flex-none text-muted"
            />
            <Words
              title="Enter a trade by hand"
              detail="Type in one trade and its fills."
            />
            <CaretRight
              size={13}
              weight="bold"
              aria-hidden="true"
              className="flex-none text-faint"
            />
          </Link>
        </li>
        <li>
          <button
            type="button"
            disabled
            className={`${OPTION} cursor-default border-transparent bg-sunken shadow-none hover:border-transparent`}
          >
            <ArrowsClockwise
              size={20}
              aria-hidden="true"
              className="flex-none text-faint"
            />
            <span className="min-w-0 flex-1">
              <b className="block text-[14px] font-semibold text-faint">
                Auto-sync
              </b>
              <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-faint">
                Trades arrive from your broker on their own.
              </span>
            </span>
            <span className="inline-flex h-[22px] flex-none items-center rounded-full bg-surface-1 px-2 text-xs font-[550] text-muted">
              Not live yet
            </span>
          </button>
        </li>
      </ul>
    </MorphDialog>
  );
}

/** The picker's state for a page that opens it from a control: `open(button)` shows `picker`. */
export function useImportPicker(): {
  open(from: HTMLElement | null): void;
  picker: ReactNode;
} {
  const [shown, setShown] = useState(false);
  const origin = useRef<HTMLElement | null>(null);
  return {
    open: (from) => {
      origin.current = from;
      setShown(true);
    },
    picker: (
      <ImportPicker open={shown} onOpenChange={setShown} origin={origin} />
    ),
  };
}
