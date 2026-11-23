'use client';

import { FigureText } from '@/components/product/figure-text';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';

/** One cell: the P&L (cents) of the trades in it, and how many. */
export interface CrossCell {
  value: number;
  count: number;
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
    ...cells.flat().map((c) => (c ? Math.abs(c.value) : 0)),
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
                    c && c.value !== 0
                      ? {
                          background: `color-mix(in srgb, ${c.value > 0 ? 'var(--gain-fill)' : 'var(--loss-fill)'} ${Math.round(10 + (Math.abs(c.value) / peak) * 38)}%, transparent)`,
                        }
                      : undefined
                  }
                >
                  {c ? (
                    <>
                      <span
                        className={`block font-semibold ${c.value > 0 ? 'text-gain' : c.value < 0 ? 'text-loss' : 'text-text'}`}
                      >
                        <FigureText f={display.cash(c.value, true, currency)} />
                      </span>
                      <span className="block text-[11.5px] text-faint">
                        {c.count} {plural(c.count, 'trade')}
                      </span>
                    </>
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
