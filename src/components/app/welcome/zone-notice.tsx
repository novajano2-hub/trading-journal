'use client';

import { CircleNotch, X } from '@phosphor-icons/react/dist/ssr';
import { useEffect } from 'react';

/** How long the notice stays before it goes by itself. */
export const NOTICE_MS = 8000;

/**
 * After the preferences save: the time zone is being applied to the trades
 * [inv-1 015]. A small card at the foot of the screen, in Keel's words (comp 13).
 * The live region is always mounted, empty, and the card is put into it when
 * there is a zone to announce, so a screen reader hears it appear.
 * Keel's call (TradeZella unknown): TradeZella's toast dismissal isn't
 * recorded, so this one goes by itself after a few seconds and has a close button.
 */
export function ZoneNotice({
  zone,
  onClose,
}: {
  /** The zone's name, or null while there is nothing to say. */
  zone: string | null;
  onClose(): void;
}): React.JSX.Element {
  return (
    <div
      role="status"
      className="fixed right-6 bottom-6 z-[60] w-[min(360px,calc(100vw-32px))] max-sm:right-4 max-sm:left-4 max-sm:w-auto max-sm:[bottom:calc(var(--tab-bar,0px)+12px)]"
    >
      {zone ? <NoticeCard zone={zone} onClose={onClose} /> : null}
    </div>
  );
}

function NoticeCard({
  zone,
  onClose,
}: {
  zone: string;
  onClose(): void;
}): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onClose, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="flex items-start gap-2.5 rounded-[12px] border border-line bg-surface-1 py-3 pr-2 pl-3.5 shadow-[var(--shadow)] motion-safe:animate-pop-in">
      <CircleNotch
        size={18}
        weight="bold"
        aria-hidden="true"
        className="mt-px flex-none text-accent-ink"
      />
      <div className="min-w-0 flex-1">
        <b className="block text-[13.5px] font-semibold">Profile saved</b>
        <span className="mt-0.5 block text-[12.5px] leading-[1.45] text-muted">
          Re-timing your trades to {zone}.
        </span>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="-my-1 grid size-9 flex-none place-items-center rounded-control text-muted outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
      >
        <X size={14} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
