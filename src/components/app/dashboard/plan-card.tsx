'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { ArrowDown, ListChecks } from '@phosphor-icons/react/dist/ssr';
import { animate, useInView, useReducedMotion } from 'motion/react';
import { formatTicker, tickerFrame } from '@/components/product/number-ticker';
import { Chip } from '@/components/ui/chip';
import { IconTile } from '@/components/ui/icon-tile';
import { MetricTip } from '@/components/ui/metric-tip';
import { RULES_SHOWN, type DashboardModel } from '@/data/dashboard';
import type { RuleScore } from '@/domain/metrics/rules';
import type { PnlBasis } from '@/domain/types';
import { formatAdherence, formatPnl, keepHyphens } from '@/lib/format';
import { EASING_POINTS } from '@/lib/motion';
import { CARD, CardHeader, HERO, signTone } from './shared';

/** The rule's adherence: a 6px ultramarine bar on its soft rail. */
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
      className={`block h-1.5 overflow-hidden rounded-[3px] bg-accent-soft ${className}`}
    >
      <span
        className="block h-full rounded-[3px] bg-[linear-gradient(90deg,color-mix(in_oklab,var(--accent)_78%,white),var(--accent))]"
        style={{ width: `${value * 100}%` }}
      />
    </span>
  );
}

const FIGURE = 'text-[13px] font-[550] tabular-nums';

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
 * comp's widths; narrower below, so the rule keeps about 250px beside the
 * hero at 1280. Below `sm` Kept and the bar hide, and the bar moves under the
 * rule.
 */
const PAD = {
  rule: 'pl-2',
  kept: 'pl-3',
  adherence: 'pl-2 sm:pl-5 min-[90rem]:pl-7',
  cost: 'pr-2 pl-2',
};
const WIDTH = {
  kept: 'w-[92px] min-[90rem]:w-[100px]',
  adherence: 'w-[52px] sm:w-[150px] min-[90rem]:w-[180px]',
  cost: 'w-[100px] sm:w-[128px] min-[90rem]:w-[140px]',
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
      {costliest ? <Chip tone="warn">Costliest</Chip> : null}
    </span>
  );

  return (
    <tr
      className={`h-9 ${
        broken
          ? 'cursor-pointer transition-colors duration-200 ease-[var(--ease-glide)] hover:bg-sunken has-[button:focus-visible]:bg-sunken'
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
            className="flex min-h-9 w-full items-center rounded-chip py-1.5 text-left text-[13.5px] font-medium text-text outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            {text}
          </button>
        ) : (
          <div className="flex min-h-9 items-center py-1.5 text-[13.5px] font-medium text-text">
            {text}
          </div>
        )}
        <Track value={rule.adherence} className="mb-2.5 sm:hidden" />
      </td>
      <td
        className={`${PAD.kept} ${LINE_MID} text-right whitespace-nowrap max-sm:hidden ${FIGURE}`}
      >
        {rule.kept} <span className="font-normal text-faint">of</span> {total}
      </td>
      <td className={`${PAD.adherence} ${LINE_MID}`}>
        <span className="flex items-center gap-2.5">
          <Track value={rule.adherence} className="flex-1 max-sm:hidden" />
          <span className={`ml-auto min-w-[34px] text-right ${FIGURE}`}>
            {pct}
          </span>
        </span>
      </td>
      <td
        className={`${PAD.cost} ${LINE_END} text-right whitespace-nowrap ${FIGURE}`}
      >
        {broken ? (
          <span className={signTone(rule.brokenPnl)}>
            {formatPnl(rule.brokenPnl, currency)}
          </span>
        ) : (
          <span className="font-normal text-faint">none</span>
        )}
      </td>
    </tr>
  );
}

/** Header cells: 12px, faint, centred in a 34px row above the first hairline. */
const TH = 'h-[34px] align-middle text-xs leading-4 font-medium text-faint';

/** Without JS the count never runs: CSS shows the final copy (as NumberTicker does). */
const NO_SCRIPT_CSS =
  '.adherence-count{display:none!important}.adherence-final{display:inline-flex!important}';

/** "87%" as the hero sets it: the number, then a small raised %. */
function Numeral({ text }: { text: string }): React.JSX.Element {
  const number = text.endsWith('%') ? text.slice(0, -1) : text;
  return (
    <>
      <span>{number}</span>
      {number !== text ? (
        <span className="mt-1 ml-1 text-[0.42em] leading-none tracking-[-0.02em] text-on-accent-muted">
          %
        </span>
      ) : null}
    </>
  );
}

/**
 * The plan's adherence at hero size. Counts up once in view, as NumberTicker
 * does, from its own frames, so the % can sit small beside the number; under
 * reduced motion (and without JS) only the final figure shows. Screen readers
 * get the final string once.
 */
function AdherenceNumeral({ value }: { value: number }): React.JSX.Element {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const final = formatTicker('adherence', value);
  const frame = tickerFrame('adherence', value);

  useEffect(() => {
    if (reduced || !inView) return;
    const controls = animate(shownRef.current, value, {
      duration: 0.9,
      ease: [...EASING_POINTS.out],
      onUpdate: (v) => {
        shownRef.current = v;
        setShown(v);
      },
      onComplete: () => {
        shownRef.current = value;
        setShown(value);
      },
    });
    return () => controls.stop();
  }, [inView, reduced, value]);

  const figure =
    'items-start text-[88px] leading-[0.82] font-semibold tracking-[-0.05em] tabular-nums [font-stretch:88%] sm:text-[104px]';
  return (
    <span ref={ref} className="inline-grid text-white">
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      <span className="sr-only">{final}</span>
      {/* Holds the final figure's width, so the count never pushes the label beside it. */}
      <span
        aria-hidden="true"
        className={`invisible col-start-1 row-start-1 inline-flex ${figure}`}
      >
        <Numeral text={final} />
      </span>
      <span
        aria-hidden="true"
        className={`adherence-count col-start-1 row-start-1 inline-flex motion-reduce:hidden ${figure}`}
      >
        <Numeral text={frame(shown)} />
      </span>
      <span
        aria-hidden="true"
        className={`adherence-final col-start-1 row-start-1 hidden motion-reduce:inline-flex ${figure}`}
      >
        <Numeral text={final} />
      </span>
    </span>
  );
}

/** A definition's label on the ultramarine card: its underline (on hover and focus) and focus ring in white. */
const ON_ACCENT_TIP =
  'hover:decoration-white/85! focus-visible:decoration-white/85! focus-visible:outline-white!';

/**
 * Row 1, "Your plan": the ultramarine hero (how many rule checks were kept,
 * and what the trades that broke a rule cost, each trade once) beside every
 * rule by its cost when broken. A broken rule's row opens its trades.
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
  /** The region itself, which takes focus when the state before it (an empty state's button) is gone. */
  regionRef: RefObject<HTMLElement | null>;
  onOpenRule(ruleId: string, button: HTMLButtonElement): void;
}): React.JSX.Element {
  const headingId = useId();
  const [all, setAll] = useState(false);

  if (plan.checks === 0 || plan.adherence === null) {
    return (
      <section
        ref={regionRef}
        tabIndex={-1}
        aria-labelledby={headingId}
        className={`${CARD} px-5 pt-[18px] pb-5 outline-none`}
      >
        <CardHeader
          icon={ListChecks}
          tone="accent"
          headingId={headingId}
          title={`Your plan, ${caption}`}
        />
        <div className="mt-3 pl-[38px]">
          <p className="text-[14px] font-medium text-text">
            No graded trades in this range.
          </p>
          <p className="mt-1 text-[13px] leading-[1.5] text-muted">
            Adherence shows once trades are checked against a strategy&apos;s
            rules.
          </p>
        </div>
      </section>
    );
  }

  const shown = all ? plan.rules : plan.rules.slice(0, RULES_SHOWN);
  const cost = plan.cost.pnl;
  const kept = plan.adherence;

  return (
    <section
      ref={regionRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="grid gap-4 outline-none xl:grid-cols-[340px_minmax(0,1fr)] min-[90rem]:grid-cols-[400px_minmax(0,1fr)]"
    >
      {/* The one coloured surface: Keel Ultramarine, the same in both themes. */}
      <div
        className={`${HERO} relative flex min-w-0 flex-col overflow-hidden px-[22px] pt-[18px]`}
      >
        <div className="flex h-7 items-center gap-2.5">
          <IconTile icon={ListChecks} tone="on-accent" />
          <h2
            id={headingId}
            // The range is in the name; on screen it sits at the card's right.
            aria-label={`Your plan, ${caption}`}
            className="text-[15px] leading-snug font-semibold tracking-[-0.015em]"
          >
            Your plan
          </h2>
          <span
            aria-hidden="true"
            className="ml-auto inline-block text-[12.5px] whitespace-nowrap text-on-accent-muted first-letter:uppercase"
          >
            {caption}
          </span>
        </div>
        <div className="mt-3.5 flex flex-wrap items-end gap-x-3.5 gap-y-2">
          <AdherenceNumeral value={kept} />
          <span className="pb-[3px] text-[15px] leading-[1.3] text-white/85">
            <MetricTip
              id="rule-adherence"
              basis={basis}
              className={ON_ACCENT_TIP}
            >
              of rule checks kept
            </MetricTip>
          </span>
        </div>
        {/* Kept and broken checks as one whole; a part at zero draws nothing. */}
        <div aria-hidden="true" className="mt-[22px] mb-[18px]">
          <div className="flex h-2 gap-[3px]">
            {kept > 0 ? (
              <span
                className="rounded-[3px] bg-white/92"
                style={{ flex: `${kept} 1 0` }}
              />
            ) : null}
            {kept < 1 ? (
              <span
                className="rounded-[3px] bg-on-accent-loss"
                style={{ flex: `${1 - kept} 1 0` }}
              />
            ) : null}
          </div>
          <div className="mt-[7px] flex justify-between text-xs text-on-accent-muted">
            <span>Kept</span>
            <span>Broken</span>
          </div>
        </div>
        <div className="-mx-[22px] mt-auto flex min-h-[54px] flex-wrap items-center justify-between gap-x-3 border-t border-white/10 bg-[rgb(10_14_70/0.22)] px-[22px] py-2">
          <span className="text-[13.5px] text-white/85">
            <MetricTip
              id="broken-rules-cost"
              basis={basis}
              className={ON_ACCENT_TIP}
            />
          </span>
          <span
            className={`text-[21px] font-semibold tracking-[-0.02em] whitespace-nowrap tabular-nums ${cost < 0 ? 'text-on-accent-loss' : 'text-white'}`}
          >
            {formatPnl(cost, currency)}
          </span>
        </div>
      </div>
      <div className={`${CARD} flex min-w-0 flex-col px-5 pt-1.5 pb-0.5`}>
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
                className={`${TH} ${PAD.adherence} ${WIDTH.adherence} max-sm:text-right`}
              >
                <MetricTip
                  id="rule-adherence"
                  basis={basis}
                  className="max-sm:hidden"
                />
                <span className="sm:hidden">%</span>
              </th>
              <th
                scope="col"
                className={`${TH} ${PAD.cost} ${WIDTH.cost} text-right`}
              >
                {/* Sorted by this column, costliest first. Below sm the label shortens; its definition keeps the long form. */}
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-text">
                  <ArrowDown
                    size={12}
                    weight="bold"
                    aria-hidden="true"
                    className="flex-none text-accent"
                  />
                  <MetricTip id="rule-cost-broken" basis={basis}>
                    {/* One run of text: as separate flex items the space would drop. */}
                    <span>
                      Cost<span className="max-sm:hidden"> when broken</span>
                    </span>
                  </MetricTip>
                </span>
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
            className="mt-auto -ml-2 h-[38px] self-start rounded-chip px-2 text-[13px] font-semibold text-accent-ink transition-colors duration-200 ease-[var(--ease-glide)] hover:bg-accent-soft hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          >
            {all ? 'Show fewer' : `Show all ${plan.rules.length} rules`}
          </button>
        ) : (
          <span className="h-3.5" />
        )}
      </div>
    </section>
  );
}
