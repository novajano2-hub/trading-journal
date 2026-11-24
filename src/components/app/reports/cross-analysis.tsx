'use client';

import Link from 'next/link';
import { FigureText } from '@/components/product/figure-text';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';

/** One cell: the P&L (cents) of the trades in it, and how many. */
export interface CrossCell {
  value: number;
  count: number;
  /** The closed trades in the cell: its P&L then reads in the chosen unit. */
  tradeIds?: readonly string[];
  /**
   * For a metric that is not money (a win rate, a profit factor, a count):
   * what the cell reads. It then shows this, and `tint` says gain or loss.
   */
  text?: string;
  /** A ratio of money amounts (a profit factor): it reads as the number, and hides under Privacy. */
  ratio?: true;
  /** Signed strength of the tint: positive gain, negative loss; default `value`. */
  tint?: number;
  /** Where the cell's trades are listed; the cell is then a link. */
  href?: string;
}

/**
 * Two breakdowns against each other, such as weekday by symbol: a table with
 * a row per `rows` entry and a column per `columns` entry, each cell tinted
 * gain or loss by its P&L against the largest in the table. A pair with no
 * trades is left blank. Money reads in the chosen display unit.
 */
export function CrossAnalysis({
  label,
  rowTitle,
  rows,
  columns,
  cell,
  currency,
}: {
  label: string;
  /** What the rows are, over the first column: "Symbol". */
  rowTitle: string;
  rows: readonly { key: string; label: string }[];
  columns: readonly { key: string; label: string }[];
  cell(row: string, column: string): CrossCell | undefined;
  currency?: string;
}): React.JSX.Element {
  const display = useDisplay();
  const cells = rows.map((r) => columns.map((c) => cell(r.key, c.key)));
  const peak = Math.max(
    1,
    ...cells.flat().map((c) => (c ? Math.abs(c.tint ?? c.value) : 0)),
  );
  /** What a cell reads: its figure, and how many trades stand behind it. */
  const figure = (c: CrossCell) => (
    <>
      <span
        className={`block font-semibold ${(c.tint ?? c.value) > 0 ? 'text-gain' : (c.tint ?? c.value) < 0 ? 'text-loss' : 'text-text'}`}
      >
        {c.ratio ? (
          <FigureText f={display.ratio(c.value)} />
        ) : c.text !== undefined ? (
          c.text
        ) : (
          <FigureText
            f={
              c.tradeIds
                ? display.figure(
                    display.ofTrades(c.tradeIds, c.value),
                    true,
                    currency,
                  )
                : display.cash(c.value, true, currency)
            }
          />
        )}
      </span>
      <span className="block text-[11.5px] text-faint">
        {c.count} {plural(c.count, 'trade')}
      </span>
    </>
  );
  return (
    <div className="overflow-x-auto">
      <table
        aria-label={label}
        className="w-full min-w-max border-separate border-spacing-[3px] text-[12.5px]"
      >
        <thead>
          <tr>
            <th scope="col" className="px-2 text-left font-medium text-faint">
              {rowTitle}
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="px-2 text-center font-medium text-faint"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.key}>
              <th
                scope="row"
                className="px-2 py-1.5 text-left font-medium whitespace-nowrap text-text"
              >
                {r.label}
              </th>
              {cells[ri]!.map((c, ci) => (
                <td
                  key={columns[ci]!.key}
                  className="h-11 min-w-[88px] rounded-[7px] px-2 text-center align-middle tabular-nums"
                  style={
                    c && (c.tint ?? c.value) !== 0
                      ? {
                          background: `color-mix(in srgb, ${(c.tint ?? c.value) > 0 ? 'var(--gain-fill)' : 'var(--loss-fill)'} ${Math.round(10 + (Math.abs(c.tint ?? c.value) / peak) * 38)}%, transparent)`,
                        }
                      : undefined
                  }
                >
                  {c ? (
                    c.href !== undefined ? (
                      <Link
                        href={c.href}
                        prefetch={false}
                        aria-label={`${r.label}, ${columns[ci]!.label}${c.ratio ? `, ${display.ratio(c.value).label}` : c.text !== undefined ? `, ${c.text}` : ''}, ${c.count} ${plural(c.count, 'trade')}, open in the trade log`}
                        className="-mx-2 block rounded-[7px] px-2 py-1 outline-offset-0 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
                      >
                        {figure(c)}
                      </Link>
                    ) : (
                      figure(c)
                    )
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
