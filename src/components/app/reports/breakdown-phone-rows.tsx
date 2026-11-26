'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatPct, plural } from '@/lib/format';
import { RatioText } from '../ratio-text';

/** One bucket of a breakdown as a phone row; the caller reads the figures through the display. */
export interface PhoneRow {
  key: string;
  name: string;
  /** The bucket's trades in the log, or undefined where it leads nowhere. */
  href: string | undefined;
  trades: number;
  winRate: number | null;
  profitFactor: number | null;
  /** The net figure, and the class that tones it (green, red, or none). */
  net: ReactNode;
  netTone: string;
}

const ROW =
  'flex min-h-[60px] min-w-0 flex-col justify-center gap-1 py-2 text-[13px] no-underline';

/**
 * A breakdown's table below 640px, as comp 09 draws it: two-line rows. Line one
 * is the bucket's name and its net; line two its trades, win rate and profit
 * factor. A bucket with trades is one link to them in the log. The rows keep the
 * order the table has (the best net first).
 */
export function BreakdownPhoneRows({
  label,
  rows,
}: {
  label: string;
  rows: readonly PhoneRow[];
}): React.JSX.Element {
  return (
    <ul aria-label={label} className="m-0 list-none p-0">
      {rows.map((r) => {
        const body = (
          <>
            <span
              data-line="1"
              className="flex min-w-0 items-baseline justify-between gap-3"
            >
              <b className="min-w-0 truncate text-[14px] font-semibold text-text">
                {r.name}
              </b>
              <span
                className={`flex-none text-[14px] font-semibold tabular-nums ${r.netTone}`}
              >
                {r.net}
              </span>
            </span>
            <span
              data-line="2"
              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-muted tabular-nums"
            >
              <span>
                {r.trades} {plural(r.trades, 'trade')}
              </span>
              <span>
                {r.winRate === null
                  ? 'no decided trades'
                  : `${formatPct(r.winRate, 1)} won`}
              </span>
              <span>
                PF <RatioText value={r.profitFactor} />
              </span>
            </span>
          </>
        );
        return (
          <li key={r.key} className="border-t border-line/70 first:border-t-0">
            {r.href === undefined ? (
              <div className={ROW}>{body}</div>
            ) : (
              <Link
                href={r.href}
                prefetch={false}
                aria-label={`${r.name}, open ${r.trades} ${plural(r.trades, 'trade')} in the trade log`}
                className={`${ROW} outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent active:bg-sunken/60`}
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
