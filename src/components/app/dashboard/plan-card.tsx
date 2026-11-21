'use client';

import { useId, useRef, useState, type RefObject } from 'react';
import { ListChecks } from '@phosphor-icons/react/dist/ssr';
import { NumberTicker } from '@/components/product/number-ticker';
import { Chip } from '@/components/ui/chip';
import { IconTile } from '@/components/ui/icon-tile';
import { MetricTip } from '@/components/ui/metric-tip';
import { RULES_SHOWN, type DashboardModel } from '@/data/dashboard';
import type { RuleScore } from '@/domain/metrics/rules';
import type { Cents, PnlBasis } from '@/domain/types';
import { formatAdherence, formatPnl, keepHyphens } from '@/lib/format';

/** Gain or loss text for signed money; zero stays uncoloured. */
export function signTone(cents: Cents): string {
  return cents < 0 ? 'text-loss' : cents > 0 ? 'text-gain' : '';
}

function Track({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      // The rail is `line`, not `sunken`, so it stays visible on a row's hover fill.
      className={`block h-1 overflow-hidden rounded-full bg-line ${className}`}
    >
      <span
        className="block h-full rounded-full bg-accent"
        style={{ width: `${value * 100}%` }}
      />
    </span>
  );
}

const MONO = 'font-mono text-[12.5px] tabular-nums';

/**
 * Each row's top hairline, drawn per cell: it stops at the content edge while
 * the row and its hover fill reach 8px past it on each side.
 */
const LINE = 'bg-[linear-gradient(var(--line),var(--line))] bg-no-repeat';
const LINE_MID = `${LINE} bg-[length:100%_1px] bg-top`;
const LINE_START = `${LINE} bg-[length:calc(100%-8px)_1px] bg-[position:right_top]`;
const LINE_END = `${LINE} bg-[length:calc(100%-8px)_1px] bg-[position:left_top]`;

/**
 * Column padding and widths, shared by the header and the rows. From 1440 the
 * sketch's widths; narrower below, so the rule text keeps about 280px beside
 * the hero at 1280; below `sm` only %, and cost remain beside the rule.
 */
const PAD = {
  rule: 'pl-2',
  kept: 'pl-3 min-[1440px]:pl-4',
  track: 'pl-3 min-[1440px]:pl-4',
  pct: 'pl-3 max-sm:pl-2 min-[1440px]:pl-4',
  cost: 'pr-2 pl-3 max-sm:pl-2 min-[1440px]:pl-4',
};
const WIDTH = {
  kept: 'w-[88px] min-[1440px]:w-24',
  track: 'w-[100px] min-[1440px]:w-[22%]',
  pct: 'w-[52px] max-sm:w-12 min-[1440px]:w-16',
  cost: 'w-[124px] max-sm:w-[104px] min-[1440px]:w-[136px]',
};

function RuleRow({
  rule,
  costliest,
  currency,
  onOpen,
}: {
  rule: RuleScore;
  costliest: boolean;
  currency: string;
  onOpen(button: HTMLButtonElement): void;
}): React.JSX.Element {
  const button = useRef<HTMLButtonElement>(null);
  const total = rule.kept + rule.broken;
  const pct = formatAdherence(rule.adherence);
  const broken = rule.broken > 0;
  const text = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="line-clamp-2">{keepHyphens(rule.text)}</span>
      {costliest ? <Chip tone="loss">Costliest</Chip> : null}
    </span>
  );

  return (
    <tr
      className={`h-[38px] ${
        broken
          ? 'cursor-pointer transition-colors duration-120 hover:bg-sunken has-[button:focus-visible]:bg-sunken'
          : ''
      }`}
      // The whole row opens it; the button inside is the keyboard's way in.
      onClick={
        broken
          ? (e) => {
              if (!(e.target as Element).closest('button'))
                button.current?.click();
            }
          : undefined
      }
    >
      <td className={`${PAD.rule} ${LINE_START} align-middle`}>
        {broken ? (
          <button
            ref={button}
            type="button"
            aria-label={`${rule.text}. Kept ${rule.kept} of ${total}, ${pct}. Cost when broken ${formatPnl(rule.brokenPnl, currency)}. Show the trades.`}
            onClick={(e) => onOpen(e.currentTarget)}
            className="flex min-h-[38px] w-full items-center rounded-chip py-2 text-left text-[13px] text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            {text}
          </button>
        ) : (
          <div className="flex min-h-[38px] items-center py-2 text-[13px] text-text">
            {text}
          </div>
        )}
        <Track value={rule.adherence} className="mb-2.5 sm:hidden" />
      </td>
      <td
        className={`${PAD.kept} ${LINE_MID} text-right whitespace-nowrap max-sm:hidden ${MONO}`}
      >
        {rule.kept} of {total}
      </td>
      <td className={`${PAD.track} ${LINE_MID} max-sm:hidden`}>
        <Track value={rule.adherence} />
      </td>
      <td className={`${PAD.pct} ${LINE_MID} text-right ${MONO}`}>{pct}</td>
      <td
        className={`${PAD.cost} ${LINE_END} text-right whitespace-nowrap ${MONO}`}
      >
        {broken ? (
          <span className={signTone(rule.brokenPnl)}>
            {formatPnl(rule.brokenPnl, currency)}
          </span>
        ) : (
          <span className="font-sans text-[13px] text-faint">none</span>
        )}
      </td>
    </tr>
  );
}

/** Header cells sit on the baseline, 8px clear of the first row's controls. */
const TH = 'pb-2 align-bottom text-xs leading-4 font-normal text-faint';

/**
 * Row 1, "Your plan": how many rule checks were kept, what the trades that
 * broke a rule cost (each trade once), and every rule by its cost when broken.
 * A broken rule's row opens its trades.
 */
export function PlanCard({
  plan,
  basis,
  currency,
  caption,
  tableRef,
  regionRef,
  onOpenRule,
}: {
  plan: DashboardModel['plan'];
  basis: PnlBasis;
  currency: string;
  /** The range, e.g. "1-20 Nov". */
  caption: string;
  /** The Rules table, which takes focus when a drill-down's opener is gone. */
  tableRef: RefObject<HTMLTableElement | null>;
  /** The card itself, which takes focus when the state before it (an empty state's button) is gone. */
  regionRef: RefObject<HTMLElement | null>;
  onOpenRule(ruleId: string, button: HTMLButtonElement): void;
}): React.JSX.Element {
  const headingId = useId();
  const [all, setAll] = useState(false);
  const heading = (
    <h2
      id={headingId}
      className="text-[14px] leading-snug font-semibold text-text"
    >
      Your plan, {caption}
    </h2>
  );

  if (plan.checks === 0 || plan.adherence === null) {
    return (
      <section
        ref={regionRef}
        tabIndex={-1}
        aria-labelledby={headingId}
        className="rounded-card border border-line bg-surface-1 px-5 py-4 outline-none"
      >
        {heading}
        <div className="flex items-start gap-3 pt-4 pb-2">
          <IconTile icon={ListChecks} />
          <div className="min-w-0 pt-1">
            <p className="text-[14px] font-medium text-text">
              No graded trades in this range.
            </p>
            <p className="mt-1 text-[13px] leading-[1.5] text-muted">
              Adherence shows once trades are checked against a strategy&apos;s
              rules.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const shown = all ? plan.rules : plan.rules.slice(0, RULES_SHOWN);
  const cost = plan.cost.pnl;
  const costPanel =
    cost < 0
      ? 'bg-loss-soft text-loss'
      : cost > 0
        ? 'bg-gain-soft text-gain'
        : 'bg-sunken text-muted';

  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface-1 px-5 py-4 outline-none xl:flex-row xl:gap-7"
    >
      <div className="flex flex-col border-line max-xl:border-b max-xl:pb-4 sm:max-xl:flex-row sm:max-xl:items-end sm:max-xl:justify-between sm:max-xl:gap-6 xl:w-[290px] xl:flex-none xl:justify-center xl:border-r xl:pr-7">
        <div>
          {heading}
          <NumberTicker
            value={plan.adherence}
            kind="adherence"
            className="mt-2.5 text-[40px] leading-[1.1] font-medium tracking-[-0.02em] text-text"
          />
          <div className="mt-1 text-[13px] text-faint">
            <MetricTip id="rule-adherence" basis={basis}>
              of rule checks kept
            </MetricTip>
          </div>
        </div>
        <div
          className={`mt-[18px] flex flex-wrap items-center gap-x-1.5 rounded-control px-3 py-2.5 text-[13.5px] font-medium sm:max-xl:mt-0 ${costPanel}`}
        >
          <MetricTip id="broken-rules-cost" basis={basis} />
          <span className="font-mono tabular-nums">
            {formatPnl(cost, currency)}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Rows reach 8px into the card's padding, so their hover fill clears the text. */}
        <table
          ref={tableRef}
          tabIndex={-1}
          aria-label="Rules"
          className="-mx-2 w-[calc(100%+16px)] table-fixed border-collapse outline-none"
        >
          <thead>
            <tr className="text-left">
              <th scope="col" className={`${TH} ${PAD.rule}`}>
                Rule
              </th>
              <th
                scope="col"
                className={`${TH} ${PAD.kept} ${WIDTH.kept} text-right max-sm:hidden`}
              >
                <MetricTip id="rule-kept" basis={basis} />
              </th>
              <th
                scope="col"
                className={`${TH} ${PAD.track} ${WIDTH.track} max-sm:hidden`}
              >
                <MetricTip id="rule-adherence" basis={basis} />
              </th>
              <th
                scope="col"
                className={`${TH} ${PAD.pct} ${WIDTH.pct} text-right`}
              >
                %
              </th>
              <th
                scope="col"
                className={`${TH} ${PAD.cost} ${WIDTH.cost} text-right`}
              >
                {/* Below sm the full label wraps to two dotted lines; its definition keeps the long form. */}
                <MetricTip id="rule-cost-broken" basis={basis}>
                  {/* One run of text: as separate flex items the space would drop. */}
                  <span>
                    Cost<span className="max-sm:hidden"> when broken</span>
                  </span>
                </MetricTip>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((rule, i) => (
              <RuleRow
                key={rule.ruleId}
                rule={rule}
                costliest={i === 0 && rule.broken > 0 && rule.brokenPnl < 0}
                currency={currency}
                onOpen={(button) => onOpenRule(rule.ruleId, button)}
              />
            ))}
          </tbody>
        </table>
        {plan.rules.length > RULES_SHOWN ? (
          <button
            type="button"
            onClick={() => setAll((a) => !a)}
            className="mt-1 -ml-2 h-8 self-start rounded-chip px-2 text-[13px] font-medium text-muted transition-colors duration-120 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          >
            {all ? 'Show fewer' : `Show all ${plan.rules.length} rules`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
