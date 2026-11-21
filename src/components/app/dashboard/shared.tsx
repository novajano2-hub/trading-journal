// What the Dashboard's cards and its drill-down share.
import type { Cents, Trade } from '@/domain/types';
import { formatInstrument } from '@/lib/format';

/** Gain or loss text for signed money; zero stays uncoloured. */
export function signTone(cents: Cents): string {
  return cents < 0 ? 'text-loss' : cents > 0 ? 'text-gain' : '';
}

/**
 * The instrument in words, "TSLA 370 Put" with its expiry faint beside it, or
 * "ES Dec 26". The title keeps the symbol as traded. Where a table folds the
 * trade's time under the symbol, `detailClassName` hides the expiry, so the
 * two dates never stack.
 */
export function InstrumentName({
  trade,
  className = '',
  detailClassName = '',
}: {
  trade: Trade;
  className?: string;
  detailClassName?: string;
}): React.JSX.Element {
  const { name, detail } = formatInstrument(trade.instrument, trade.openedAt);
  return (
    <span
      title={trade.instrument.symbol}
      className={`flex min-w-0 flex-wrap items-baseline gap-x-1.5 ${className}`}
    >
      <span className="whitespace-nowrap">{name}</span>
      {detail !== undefined ? (
        <span
          className={`min-w-0 truncate text-xs text-faint ${detailClassName}`}
        >
          <span className="sr-only">expires </span>
          {detail}
        </span>
      ) : null}
    </span>
  );
}
