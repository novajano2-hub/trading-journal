'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { statusOf, netRoiOf } from '@/data/trade-rows';
import type { Trade } from '@/domain/types';
import { isClosed } from '@/domain/trade-status';
import type { MetricContext } from '@/domain/metrics/context';
import { useDisplay, formatUnitValue } from '@/lib/display';
import { plural, price } from '@/lib/format';
import { usePhone } from '@/lib/use-phone';
import { FigureText } from '@/components/product/figure-text';
import {
  CARD,
  CARD_PAD,
  Caption,
  CardHeader,
  InstrumentName,
  signTone,
} from '../dashboard/shared';
import { StatusChip } from '../trades/cells';
import { useImportPicker } from './import-picker';

const PHONE_ROWS = 5;
const TH =
  'sticky top-0 z-[1] bg-surface-1 px-2 py-2 text-left text-[12.5px] font-normal text-faint';
const TD = 'px-2 py-2.5 text-[13.5px] tabular-nums';

function Row({
  trade,
  ctx,
  timeZone,
}: {
  trade: Trade;
  ctx: MetricContext;
  timeZone: string;
}): React.JSX.Element {
  const router = useRouter();
  const display = useDisplay();
  const closed = isClosed(trade);
  const href = `/app/trades/${encodeURIComponent(trade.id)}`;
  const roi = netRoiOf(trade);
  const net = closed ? display.cash(trade.net, true, trade.pnlCurrency) : null;
  return (
    <tr
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a')) router.push(href);
      }}
      className="cursor-pointer border-t border-line/70 first:border-t-0 hover:bg-sunken/60"
    >
      <td className={TD}>
        <Link
          href={href}
          className="rounded-chip no-underline outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <InstrumentName
            trade={trade}
            timeZone={timeZone}
            className="flex-nowrap!"
          />
        </Link>
      </td>
      <td className={TD}>
        <StatusChip status={statusOf(trade, ctx)} />
      </td>
      <td className={`${TD} text-right`}>
        {price(trade.avgEntry, trade.instrument.tickSize)}
      </td>
      <td className={`${TD} text-right`}>
        {trade.avgExit === undefined ? (
          <span className="text-faint">None</span>
        ) : (
          price(trade.avgExit, trade.instrument.tickSize)
        )}
      </td>
      <td
        className={`${TD} text-right font-[550] ${closed ? signTone(trade.net) : ''}`}
      >
        {net ? (
          <FigureText f={net} />
        ) : (
          <span className="text-faint">None</span>
        )}
      </td>
      <td
        className={`${TD} text-right ${roi === undefined ? '' : signTone(roi)}`}
      >
        {roi === undefined || !closed ? (
          <span className="text-faint">None</span>
        ) : (
          formatUnitValue('percent', roi, {
            currency: trade.pnlCurrency,
            signed: true,
          })
        )}
      </td>
    </tr>
  );
}

function PhoneRow({
  trade,
  ctx,
  timeZone,
}: {
  trade: Trade;
  ctx: MetricContext;
  timeZone: string;
}): React.JSX.Element {
  const display = useDisplay();
  const closed = isClosed(trade);
  const roi = netRoiOf(trade);
  const net = closed ? display.cash(trade.net, true, trade.pnlCurrency) : null;
  const tick = trade.instrument.tickSize;
  return (
    <li className="border-t border-line/70 first:border-t-0">
      <Link
        href={`/app/trades/${encodeURIComponent(trade.id)}`}
        className="flex min-h-[60px] flex-col justify-center gap-1 py-2 no-underline outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="flex items-baseline justify-between gap-3">
          <InstrumentName
            trade={trade}
            timeZone={timeZone}
            showExpiry={false}
            className="flex-nowrap! text-[14px]"
          />
          <StatusChip status={statusOf(trade, ctx)} />
        </span>
        <span className="flex items-baseline gap-3 text-[12.5px] text-muted tabular-nums">
          <span className="mr-auto">
            {price(trade.avgEntry, tick)} to{' '}
            {trade.avgExit === undefined ? 'None' : price(trade.avgExit, tick)}
          </span>
          <b
            className={`text-[14px] font-[550] ${closed ? signTone(trade.net) : ''}`}
          >
            {net ? <FigureText f={net} /> : 'None'}
          </b>
          <span className={roi === undefined || !closed ? '' : signTone(roi)}>
            {roi === undefined || !closed
              ? 'None'
              : formatUnitValue('percent', roi, {
                  currency: trade.pnlCurrency,
                  signed: true,
                })}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * The day's trades (rec S23): exactly Symbol, Status, Entry, Exit, Net P&L
 * and Net ROI, in a card of fixed height that scrolls inside itself. A phone
 * gets two-line rows, five of them and then "Show all". A day without trades
 * says so and offers Import; a day with trades never does.
 */
export function ReviewTrades({
  trades,
  ctx,
  timeZone,
  scope,
}: {
  trades: readonly Trade[];
  ctx: MetricContext;
  timeZone: string;
  /** Which accounts the list reads, in words: "all accounts" or the one. */
  scope: string;
}): React.JSX.Element {
  const phone = usePhone();
  const [all, setAll] = useState(false);
  const imports = useImportPicker();
  const importButton = useRef<HTMLButtonElement>(null);
  const shown = phone && !all ? trades.slice(0, PHONE_ROWS) : trades;
  return (
    <section
      aria-labelledby="day-trades-title"
      className={`${CARD} ${CARD_PAD} min-w-0 pb-2`}
    >
      <CardHeader
        headingId="day-trades-title"
        title="Trades"
        after={
          <Caption>
            {trades.length} {plural(trades.length, 'trade')}, {scope}
          </Caption>
        }
      />
      {trades.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <p className="text-[13.5px] text-muted">No trades on this day.</p>
          <button
            ref={importButton}
            type="button"
            onClick={() => imports.open(importButton.current)}
            className={buttonClasses('secondary')}
          >
            Import
          </button>
          {imports.picker}
        </div>
      ) : phone ? (
        <>
          <ul aria-label="Trades" className="m-0 list-none p-0">
            {shown.map((t) => (
              <PhoneRow key={t.id} trade={t} ctx={ctx} timeZone={timeZone} />
            ))}
          </ul>
          {!all && trades.length > PHONE_ROWS ? (
            <button
              type="button"
              onClick={() => setAll(true)}
              className={`${buttonClasses('ghost', 'sm')} my-2`}
            >
              Show all {trades.length} trades
            </button>
          ) : null}
        </>
      ) : (
        <div
          className="-mx-2 mt-1.5 h-[268px] overflow-auto px-2 [mask-image:linear-gradient(to_bottom,#000_calc(100%-30px),transparent)]"
          tabIndex={0}
          aria-label="Trades, scrolling"
        >
          <table
            aria-label="Trades"
            className="w-full min-w-[560px] table-fixed border-collapse"
          >
            <colgroup>
              <col />
              <col className="w-[84px]" />
              <col className="w-[100px]" />
              <col className="w-[100px]" />
              <col className="w-[104px]" />
              <col className="w-[92px]" />
            </colgroup>
            <thead>
              <tr>
                <th className={TH}>Symbol</th>
                <th className={TH}>Status</th>
                <th className={`${TH} text-right`}>Entry</th>
                <th className={`${TH} text-right`}>Exit</th>
                <th className={`${TH} text-right`}>Net P&amp;L</th>
                <th className={`${TH} text-right`}>Net ROI</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <Row key={t.id} trade={t} ctx={ctx} timeZone={timeZone} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
