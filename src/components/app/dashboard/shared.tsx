// What the Dashboard's cards and its drill-down share.
import type { ReactNode } from 'react';
import type { Cents, Trade } from '@/domain/types';
import { formatInstrument } from '@/lib/format';

/** Gain or loss text for signed money; zero stays uncoloured. */
export function signTone(cents: Cents): string {
  return cents < 0 ? 'text-loss' : cents > 0 ? 'text-gain' : '';
}

/** A white card: 16px radius, hairline border, the card shadow. */
export const CARD =
  'rounded-card border border-line bg-surface-1 shadow-[var(--shadow-card)]';

/** A card's padding: 18px above, 20px at the sides, 16px below. */
export const CARD_PAD = 'px-5 pt-[18px] pb-4';

/**
 * A card's header row, 28px tall: its title (15px, 600), then `after` beside
 * it (a caption) and `end` at the far right (a link, a figure or controls).
 * No glyph and no tile: the title carries the card.
 */
export function CardHeader({
  headingId,
  title,
  after,
  end,
  className = '',
}: {
  headingId: string;
  title: ReactNode;
  after?: ReactNode;
  end?: ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={`flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1 ${className}`}
    >
      <h2
        id={headingId}
        className="text-[15px] leading-snug font-semibold tracking-[-0.015em] text-text"
      >
        {title}
      </h2>
      {after}
      {end !== undefined ? (
        <span className="ml-auto flex min-w-0 items-center">{end}</span>
      ) : null}
    </div>
  );
}

/** The range beside a card's title, e.g. "all time". */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <span className="text-[12.5px] whitespace-nowrap text-faint">
      {children}
    </span>
  );
}

/**
 * A link-styled action in a card's header: accent, 12.5px. Its negative
 * margins keep the header the height of its title; on touch it reaches 44px.
 */
export const HEADER_LINK =
  '-my-1.5 -mr-2 inline-flex h-8 items-center rounded-chip px-2 text-[12.5px] font-semibold text-accent-ink transition-colors duration-200 ease-[var(--ease-glide)] hover:bg-accent-soft hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:-my-3 pointer-coarse:h-11';

/** The time a trade closed as its two parts: "19 Nov", "10:00". */
export function splitTime(text: string): { date: string; time: string } {
  const at = text.lastIndexOf(' ');
  return at < 0
    ? { date: '', time: text }
    : { date: text.slice(0, at), time: text.slice(at + 1) };
}

/** "19 Nov 10:00" with the date muted and the time in weight: the time is what tells today's rows apart. */
export function TradeTime({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}): React.JSX.Element {
  const { date, time } = splitTime(text);
  return (
    <span className={`whitespace-nowrap tabular-nums ${className}`}>
      <span className="text-muted">{date}</span>{' '}
      <span className="font-semibold text-text">{time}</span>
    </span>
  );
}

/**
 * The instrument in words, "TSLA 370 Put" with the root in weight, the
 * contract muted and its expiry faint beside it (left out when it is the day the
 * trade opened), or "ES Dec 26". The title
 * keeps the symbol as traded. Where a table folds the trade's time under the
 * symbol, `detailClassName` hides the expiry, so the two dates never stack.
 */
export function InstrumentName({
  trade,
  timeZone,
  className = '',
  detailClassName = '',
  showExpiry = true,
}: {
  trade: Trade;
  /** The zone the trade's open day is read in: an option's expiry shows only when it is another day. */
  timeZone?: string;
  className?: string;
  detailClassName?: string;
  /** False in a tight table cell: the expiry then moves into the tooltip, with the full instrument. */
  showExpiry?: boolean;
}): React.JSX.Element {
  const { name, detail } = formatInstrument(
    trade.instrument,
    trade.openedAt,
    timeZone,
  );
  // Only a name Keel composed (an option, a dated future) splits into root and contract.
  const at = name === trade.instrument.symbol ? -1 : name.indexOf(' ');
  return (
    <span
      title={
        detail !== undefined && !showExpiry
          ? `${trade.instrument.symbol}, expires ${detail}`
          : trade.instrument.symbol
      }
      className={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 ${className}`}
    >
      <span className="whitespace-nowrap">
        {at < 0 ? (
          <span className="font-semibold tracking-[0.01em] text-text">
            {name}
          </span>
        ) : (
          <>
            <span className="font-semibold tracking-[0.01em] text-text">
              {name.slice(0, at)}
            </span>{' '}
            <span className="text-muted">{name.slice(at + 1)}</span>
          </>
        )}
      </span>
      {detail !== undefined ? (
        <span
          className={
            showExpiry
              ? `min-w-0 truncate text-xs text-faint ${detailClassName}`
              : 'sr-only'
          }
        >
          <span className="sr-only">expires </span>
          {detail}
        </span>
      ) : null}
    </span>
  );
}
