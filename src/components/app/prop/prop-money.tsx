'use client';

import { useId } from 'react';
import { FigureText } from '@/components/product/figure-text';
import { Segmented } from '@/components/ui/segmented';
import { usePrefs } from '@/data/query/hooks';
import type { PropFinance, PropFinanceView } from '@/data/prop-finance';
import type { BreakdownRow } from '@/domain/prop/finance';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { CardHeader, signTone } from '../dashboard/shared';
import { TipGlyph } from '../dashboard/widgets/frame';
import { PANEL } from './prop-parts';

type By = PropFinanceView['breakdown'];

const OPTIONS = [
  { value: 'firm', label: 'Firm' },
  { value: 'type', label: 'Type' },
  { value: 'size', label: 'Size' },
  { value: 'fee', label: 'Fee' },
] as const;
/** How the grouping reads in the table's name, and its first column's heading. */
const WORDS: Record<By, { by: string; heading: string }> = {
  firm: { by: 'firm', heading: 'Firm' },
  type: { by: 'account type', heading: 'Type' },
  size: { by: 'account size', heading: 'Size' },
  fee: { by: 'fee type', heading: 'Fee type' },
};

/** What stands behind a row: the challenges of its group, or the transactions of a fee. */
function countText(by: By, n: number): string {
  if (by === 'fee') return `${n} ${plural(n, 'transaction')}`;
  return n === 0 ? 'No challenge' : `${n} ${plural(n, 'challenge')}`;
}

/** The bar for what went out or came in: a share of the longest in the card, never gone entirely. */
function Bar({
  kind,
  title,
  cents,
  scale,
}: {
  kind: 'spent' | 'earned';
  title: string;
  cents: number;
  scale: number;
}): React.JSX.Element | null {
  if (cents <= 0 || scale <= 0) return null;
  return (
    <i
      data-bar={kind}
      title={title}
      style={{
        width: `${Math.max(0.6, (cents / scale) * 100).toFixed(1)}%`,
        background:
          kind === 'spent'
            ? 'color-mix(in srgb, var(--loss-fill) 75%, var(--surface-1))'
            : 'color-mix(in srgb, var(--gain-fill) 80%, var(--surface-1))',
      }}
      className="block h-1.5 rounded-[2px]"
    />
  );
}

/**
 * Where the money went (comp 04): spent, earned and net by firm, account type
 * or account size, or the costs by fee type. Each row has its two bars, drawn
 * against the longest of the card, and its net at the right. The rows are the
 * picture; a hidden table beside them holds every figure.
 */
export function MoneyCard({
  d,
  by,
  onBy,
}: {
  d: PropFinance;
  by: By;
  onBy(next: By): void;
}): React.JSX.Element {
  const id = useId();
  const display = useDisplay();
  const basis = usePrefs().data?.pnlBasis ?? 'net';
  const rows = d.breakdown;
  const scale = Math.max(0, ...rows.flatMap((r) => [r.spent, r.earned]));
  // A size is an amount: it reads through the display, and so hides under Privacy.
  const sized = (r: BreakdownRow) => by === 'size' && r.key !== 'none';
  const name = (r: BreakdownRow) =>
    sized(r) ? <FigureText f={display.cash(Number(r.key), false)} /> : r.label;
  const nameWords = (r: BreakdownRow) =>
    sized(r) ? display.cash(Number(r.key), false).label : r.label;
  const money = (cents: number) => display.cash(cents, true);
  const out = (cents: number) => (cents === 0 ? 0 : -cents);

  return (
    <section aria-labelledby={id} className={PANEL}>
      <CardHeader
        headingId={id}
        title="Where the money went"
        after={
          <TipGlyph id="prop-money" basis={basis} name="Where the money went" />
        }
        end={
          <Segmented
            label="Break down by"
            options={OPTIONS}
            value={by}
            onChange={onBy}
            coarseTargets
          />
        }
      />
      {rows.length === 0 ? (
        <p className="py-10 text-center text-[13.5px] text-faint">
          {by === 'fee'
            ? 'No costs to break down.'
            : 'Nothing spent or earned yet.'}
        </p>
      ) : (
        <>
          <ul data-list="money" aria-hidden="true" className="mt-2.5">
            {rows.map((r) => (
              <li
                key={r.key}
                className="grid min-h-10 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 border-t border-line/70 text-[13px] first:border-t-0 sm:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto]"
              >
                <span className="min-w-0 truncate font-medium">
                  {name(r)}
                  <small className="block truncate text-[12px] font-normal text-faint">
                    {countText(by, r.count)}
                  </small>
                </span>
                <span className="flex flex-col gap-[3px]">
                  <Bar
                    kind="spent"
                    title={`Spent ${money(out(r.spent)).text}`}
                    cents={r.spent}
                    scale={scale}
                  />
                  <Bar
                    kind="earned"
                    title={`Earned ${money(r.earned).text}`}
                    cents={r.earned}
                    scale={scale}
                  />
                </span>
                <b
                  className={`text-right font-semibold whitespace-nowrap tabular-nums ${signTone(r.net)}`}
                >
                  <FigureText f={money(r.net)} />
                </b>
              </li>
            ))}
          </ul>
          <div className="sr-only">
            <table aria-label={`Where the money went, by ${WORDS[by].by}`}>
              <thead>
                <tr>
                  <th scope="col">{WORDS[by].heading}</th>
                  <th scope="col">
                    {by === 'fee' ? 'Transactions' : 'Challenges'}
                  </th>
                  <th scope="col">Spent</th>
                  <th scope="col">Earned</th>
                  <th scope="col">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">{nameWords(r)}</th>
                    <td>{r.count}</td>
                    <td>{money(out(r.spent)).label}</td>
                    <td>{money(r.earned).label}</td>
                    <td>{money(r.net).label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-1 pt-2 text-[12px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="size-2.5 rounded-[3px]"
            style={{
              background:
                'color-mix(in srgb, var(--loss-fill) 75%, var(--surface-1))',
            }}
          />
          Spent
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i
            aria-hidden="true"
            className="size-2.5 rounded-[3px]"
            style={{
              background:
                'color-mix(in srgb, var(--gain-fill) 80%, var(--surface-1))',
            }}
          />
          Earned
        </span>
        <span className="ml-auto">Net at the right</span>
      </div>
    </section>
  );
}
