import type { ReactNode } from 'react';
import { SectionHeading } from './section-heading';

/** An operator in a formula, set in the accent so the terms read apart. */
const Op = ({ children }: { children: ReactNode }) => (
  <em className="font-semibold text-accent-ink not-italic">{children}</em>
);

const DEFINITIONS: readonly { term: string; formula: ReactNode }[] = [
  {
    term: 'Net P&L',
    formula: (
      <>
        (exit <Op>-</Op> entry) <Op>×</Op> signed qty <Op>×</Op> point value{' '}
        <Op>-</Op> fees
      </>
    ),
  },
  {
    term: 'Expectancy',
    formula: (
      <>
        win% <Op>×</Op> avg win <Op>-</Op> loss% <Op>×</Op> avg loss
      </>
    ),
  },
  {
    term: 'Realized R',
    formula: (
      <>
        net P&amp;L <Op>÷</Op> initial risk
      </>
    ),
  },
  {
    term: 'Breakeven',
    formula: (
      <>
        from <Op>≤</Op> net <Op>≤</Op> to, in dollars or % of ROI
      </>
    ),
  },
];

/** "Every number has a definition.": each metric's formula, in a two-column list. */
export function Definitions() {
  return (
    <section
      aria-labelledby="defs-title"
      className="mx-auto max-w-[1280px] px-5 pb-28 sm:px-10"
    >
      <SectionHeading id="defs-title" title="Every number has a definition.">
        Fees are in every figure, and each metric&apos;s formula is written
        down, so you can check the math yourself.
      </SectionHeading>
      <dl className="mt-12 grid gap-x-16 md:grid-cols-2">
        {DEFINITIONS.map((d) => (
          <div key={d.term} className="border-t border-line-2 py-[22px]">
            <dt className="text-sm text-muted">{d.term}</dt>
            <dd className="mt-2 text-[17px] leading-normal font-medium tnum">
              {d.formula}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
