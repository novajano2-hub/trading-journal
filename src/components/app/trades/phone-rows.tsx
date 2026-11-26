'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Trade } from '@/domain/types';
import { shortTime } from '@/lib/time-format';
import { InstrumentName, TradeTime } from '../dashboard/shared';
import { TagCountCell } from './cells';
import { cellOf, type CellEnv } from './columns';
import { SelectBox } from './select-box';

/**
 * The trade log below 640px: a list of two-line rows. Line one is the
 * instrument and time on the left and the signed net on the right; line two is
 * the side, R, the rules and a tag count chip. The row is one link to the trade (carrying the
 * log's filters, as the table's instrument link does); the selection box sits
 * beside it, as a link can't hold a control.
 */
export function PhoneRows({
  trades,
  env,
  chosen,
  onToggle,
  marksOpen = false,
}: {
  trades: readonly Trade[];
  env: CellEnv;
  /** Without both, the rows carry no selection box (the Day and Week views). */
  chosen?: ReadonlySet<string>;
  onToggle?: (id: string, on: boolean) => void;
  /** A muted "(open)" before an open trade's net (the Day and Week views). */
  marksOpen?: boolean;
}): React.JSX.Element {
  const search = useSearchParams().toString();
  return (
    <ul aria-label="Trades" className="m-0 list-none p-0">
      {trades.map((t) => {
        const on = chosen?.has(t.id) ?? false;
        return (
          <li
            key={t.id}
            data-selected={on || undefined}
            className={`flex items-stretch border-t border-line/70 first:border-t-0 ${on ? 'bg-accent-soft/70' : ''}`}
          >
            {chosen && onToggle ? (
              <div className="flex flex-none items-center pl-2">
                <SelectBox
                  label={`Select trade ${t.serial}`}
                  checked={on}
                  onChange={(next) => onToggle(t.id, next)}
                />
              </div>
            ) : null}
            <Link
              href={`/app/trades/${encodeURIComponent(t.id)}${search ? `?${search}` : ''}`}
              className={`flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-1 py-2 pr-4 ${chosen ? 'pl-1.5' : 'pl-4'} text-[13px] no-underline outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent active:bg-sunken/60`}
            >
              <span
                data-line="1"
                className="flex min-w-0 items-baseline justify-between gap-3"
              >
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <InstrumentName
                    trade={t}
                    timeZone={env.timeZone}
                    showExpiry={false}
                    className="flex-nowrap! text-[14px]"
                  />
                  <TradeTime
                    text={shortTime(t.openedAt, env.timeZone)}
                    className="text-[12.5px]"
                  />
                </span>
                <span className="flex-none text-[14px] tabular-nums">
                  {marksOpen && t.status === 'open' ? (
                    <span className="mr-1 text-faint">(open)</span>
                  ) : null}
                  {cellOf('net', t, env)}
                </span>
              </span>
              <span
                data-line="2"
                className="flex min-h-5 min-w-0 items-center gap-3 text-[12.5px] text-muted"
              >
                <span className="flex-none">
                  {t.direction === 'long' ? 'Long' : 'Short'}
                </span>
                {t.status === 'closed' ? (
                  <span className="flex-none tabular-nums">
                    {cellOf('realizedR', t, env)}
                  </span>
                ) : null}
                <span className="flex-none">{cellOf('rules', t, env)}</span>
                {env.facts.tagsOf(t).length + env.facts.mistakesOf(t).length >
                0 ? (
                  <span className="flex-none">
                    <TagCountCell
                      tags={env.facts.tagsOf(t)}
                      mistakes={env.facts.mistakesOf(t)}
                    />
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
