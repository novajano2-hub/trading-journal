'use client';

import { CheckCircle, XCircle } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CARD } from '@/components/app/dashboard/shared';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { MetricTip } from '@/components/ui/metric-tip';
import {
  BREACH_REASON_LABELS,
  CHALLENGE_TYPE_LABELS,
  challengeType,
} from '@/domain/prop/finance';
import {
  drawdownLabel,
  findingText,
  type ChallengeCheck,
  type ChallengePhaseCheck,
} from '@/domain/prop/challenge';
import type { Cents, Challenge, ChallengeStep } from '@/domain/types';
import { useDisplay } from '@/lib/display';

// Spelled out, not read from Intl: the en-GB short month for September is
// "Sept" in current engines, and Keel writes "Sep".
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "19 Nov" from YYYY-MM-DD. */
function dayMonth(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`;
}

/** "Thu 19 Nov". */
function dayLabel(date: string): string {
  const weekday = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(new Date(`${date}T00:00:00Z`));
  return `${weekday} ${dayMonth(date)}`;
}

/** "1 Oct 2026". */
export function dateLabel(date: string): string {
  return `${dayMonth(date)} ${date.slice(0, 4)}`;
}

/** The phase the card reads: the funded one once the trader says so, else the current evaluation step. */
export function shownPhase(
  c: Challenge,
  check: ChallengeCheck,
): ChallengePhaseCheck | undefined {
  if (c.phase === 'funded')
    return check.phases.find((p) => p.step === 'funded');
  const current = check.phases.find((p) => p.step === check.currentStep);
  if (current && current.step !== 'funded') return current;
  // Every linked evaluation step is on target: the last of them.
  return (
    [...check.phases].reverse().find((p) => p.step !== 'funded' && p.state) ??
    check.phases[0]
  );
}

/** "Evaluation" (a one-step challenge), "Step 1", "Step 2" or "Funded". */
export function phaseName(c: Challenge, step: ChallengeStep): string {
  if (step === 'funded') return 'Funded';
  if (c.steps === 1) return 'Evaluation';
  return step === 'step-1' ? 'Step 1' : 'Step 2';
}

/** "Evaluation", "Step 1 of 2" or "Funded". */
export function phaseLabel(c: Challenge, step: ChallengeStep): string {
  if (step === 'funded') return 'Funded';
  if (c.steps === 1) return 'Evaluation';
  return `Step ${step === 'step-1' ? 1 : 2} of 2`;
}

const clamp = (n: number): number => Math.min(1, Math.max(0, n));

type BarTone = 'accent' | 'loss' | 'gain';
const BAR: Record<BarTone, string> = {
  accent: 'bg-accent',
  loss: 'bg-loss',
  gain: 'bg-gain',
};

const STATUS = {
  active: { tone: 'accent', label: 'Active' },
  near: { tone: 'loss', label: 'Near a limit' },
  breached: { tone: 'loss', label: 'Breached' },
  passed: { tone: 'gain', label: 'Passed' },
} as const;

export function StatusChip({
  kind,
}: {
  kind: keyof typeof STATUS;
}): React.JSX.Element {
  const { tone, label } = STATUS[kind];
  // Comp 12: "near" is the loss colour outlined on the surface, not filled.
  const outlined =
    kind === 'near' ? 'bg-surface-1! ring-1 ring-loss-fill/45 ring-inset' : '';
  return (
    <Chip
      tone={tone}
      className={`h-6 px-2.5 text-[12px] font-semibold ${outlined}`}
    >
      {kind === 'breached' ? (
        <XCircle size={14} weight="fill" aria-hidden="true" />
      ) : kind === 'passed' ? (
        <CheckCircle size={14} weight="fill" aria-hidden="true" />
      ) : (
        <i
          aria-hidden="true"
          className={`size-[7px] rounded-full ${kind === 'near' ? 'bg-loss-fill' : 'bg-current'}`}
        />
      )}
      {label}
    </Chip>
  );
}

/**
 * The money in a stored sentence reads "hidden amount" under Privacy: no
 * amount may show there, in any currency ($, €, £, CA$, or a code such as CHF).
 */
export function maskedReason(text: string, privacy: boolean): string {
  return privacy
    ? text.replace(
        /[−-]?(?:[A-Z]{1,3}[\s\u00a0]?)?\p{Sc}[\s\u00a0]?\d[\d.,]*|[−-]?\b[A-Z]{3}[\s\u00a0]\d[\d.,]*/gu,
        'hidden amount',
      )
    : text;
}

/**
 * Why and when a breached challenge broke, in loss ink: the date, the reason
 * from the list and the trader's own words (a challenge breached before the
 * list kept only its words). Money in the words reads "hidden amount" under
 * Privacy.
 */
function BreachLine({
  c,
  privacy,
}: {
  c: Challenge;
  privacy: boolean;
}): React.JSX.Element {
  const reason = c.breachReason ? BREACH_REASON_LABELS[c.breachReason] : null;
  // The words are the trader's for "other", and all a breach before the list
  // kept; for a listed reason the label says it (a stored rule sentence adds
  // nothing).
  const words =
    c.failureReason &&
    (c.breachReason === undefined || c.breachReason === 'other')
      ? maskedReason(c.failureReason, privacy).replace(/−(?=\S)/g, '−\u2060')
      : null;
  const detail = [reason, words].filter(Boolean).join(': ');
  return (
    <p className="mt-2 text-[12.5px] font-semibold text-loss">
      Breached{c.breachedOn ? ` ${dayLabel(c.breachedOn)}` : ''}
      {detail ? `: ${detail}` : ''}
    </p>
  );
}

/**
 * The status chip a challenge shows: the trader's own status (a breached one is
 * settled), else read against the numbers: near a limit, passed (every
 * evaluation step on target and no funded account yet) or active.
 */
export function challengeChip(
  c: Challenge,
  check: ChallengeCheck,
): keyof typeof STATUS {
  const evalPhases = check.phases.filter((p) => p.step !== 'funded');
  const passedEval =
    c.phase === 'evaluation' &&
    evalPhases.length > 0 &&
    evalPhases.every((p) => p.state?.overall === 'target-reached') &&
    !check.phases.some((p) => p.step === 'funded' && p.accountId);
  return c.status === 'breached'
    ? 'breached'
    : check.health === 'near'
      ? 'near'
      : passedEval
        ? 'passed'
        : 'active';
}

/**
 * One challenge as a card of the Accounts grid (comp 05): its name, firm and
 * phase, the status chip and the row menu; the balance with its start and the
 * type; the linked trading account and the start date; the phase's tracked
 * rules; and, in the card's one live region, what the numbers suggest: a rule
 * broken (Mark as breached), a target met (Move to funded, or link the next
 * step). The status is the trader's: a suggestion changes nothing until it is
 * accepted, and each action asks first. Money reads in the account's currency
 * through the display, so Privacy hides it.
 */
export function ChallengeCard({
  challenge: c,
  check,
  started,
  menu,
  onEdit,
  onMarkBreached,
  onMoveToFunded,
}: {
  challenge: Challenge;
  check: ChallengeCheck;
  /** The day it started (YYYY-MM-DD), when it is known. */
  started: string | null;
  /** The row menu, at the head's end. */
  menu?: ReactNode;
  onEdit(): void;
  /** Opens the Mark as breached dialog, which asks why. */
  onMarkBreached(): void;
  /** Asks, then moves the challenge to its funded phase. */
  onMoveToFunded(): void;
}): React.JSX.Element {
  const display = useDisplay();
  const headingId = `challenge-${c.id}`;
  const phase = shownPhase(c, check);
  const account = phase?.account;
  const currency = account?.currency ?? 'USD';
  const money = (cents: Cents, signed = false) => (
    <FigureText f={display.cash(cents, signed, currency)} />
  );
  const text = (cents: Cents) => display.cash(cents, false, currency);

  const lastEval: ChallengeStep = c.steps === 2 ? 'step-2' : 'step-1';
  // The stored status is the trader's, but a breached one is settled: every
  // other status (a stored "passed" too) is still read against the numbers.
  const open = c.status !== 'breached';
  const finding =
    open && check.health === 'breached' ? check.finding : undefined;
  const targetMet =
    open && c.phase === 'evaluation' && check.health === 'target-met';
  const lastMet =
    targetMet &&
    check.currentStep === lastEval &&
    check.phases.find((p) => p.step === lastEval)?.state?.overall ===
      'target-reached';
  const sentence = finding
    ? (() => {
        const shown = findingText(finding, (v) => text(v).text);
        const spoken = findingText(finding, (v) => text(v).label);
        return shown === spoken ? (
          shown
        ) : (
          <>
            <span aria-hidden="true">{shown}</span>
            <span className="sr-only">{spoken}</span>
          </>
        );
      })()
    : null;

  return (
    <article
      aria-labelledby={headingId}
      className={`${CARD} flex min-w-0 flex-col px-5 pt-4 pb-4`}
    >
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
          <h2
            id={headingId}
            className="text-[15px] leading-tight font-semibold tracking-[-0.015em]"
          >
            {c.name}
          </h2>
          <span className="text-[12.5px] text-faint">
            {c.firm},{' '}
            {(phase ? phaseName(c, phase.step) : 'Evaluation').toLowerCase()}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusChip kind={challengeChip(c, check)} />
          {menu}
        </div>
      </header>

      {phase?.archived ? (
        <p className="mt-2.5 text-[12.5px] font-medium text-warn">
          Account archived
        </p>
      ) : phase?.balance !== undefined && account ? (
        <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5">
          <b className="text-[24px] leading-tight font-semibold tracking-[-0.03em] tabular-nums">
            {money(phase.balance)}
          </b>{' '}
          <span className="text-[12.5px] text-muted">
            from {money(account.startingBalance)},{' '}
            {CHALLENGE_TYPE_LABELS[challengeType(c)]}
          </span>
        </p>
      ) : null}
      <p className="mt-1 text-[12.5px] text-muted">
        {account ? account.name : 'No trading account linked'}
        {started ? `, started ${dateLabel(started)}` : ''}
        {phase?.step === 'funded' && phase.paidOut ? (
          <>, {money(phase.paidOut)} paid out</>
        ) : null}
      </p>
      {c.status === 'breached' ? (
        <BreachLine c={c} privacy={display.unit === 'privacy'} />
      ) : null}

      {phase ? <RuleLines phase={phase} className="mt-2.5" /> : null}
      {!phase?.state || !account?.propRules ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-muted">
          <p className="min-w-0 flex-1">
            {phase?.archived
              ? 'Its account is archived, so Keel has no rules to read here.'
              : phase?.accountId
                ? "No rules yet. Add the firm's limits and Keel tracks this phase like the others."
                : "No account linked to this phase yet. Link one and add the firm's limits, and Keel tracks it like the others."}
          </p>
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Set up rules
          </Button>
        </div>
      ) : null}

      {/* The card's one live region: always mounted, so a change in it is announced. */}
      <div role="status" className="empty:hidden">
        {sentence || targetMet ? (
          <div
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control bg-loss-soft/60 px-3 py-2.5 text-[13px] data-[kind=met]:bg-gain-soft/60"
            data-kind={targetMet && !sentence ? 'met' : 'breach'}
          >
            <span className="min-w-0 flex-1 font-medium text-text">
              {sentence ??
                (lastMet
                  ? 'The profit target is met, with the minimum days and consistency.'
                  : 'This step is on target. Link the next step in Edit to carry on.')}
            </span>
            {sentence && finding ? (
              <Button size="sm" variant="secondary" onClick={onMarkBreached}>
                Mark as breached
              </Button>
            ) : lastMet ? (
              <Button size="sm" variant="secondary" onClick={onMoveToFunded}>
                Move to funded
              </Button>
            ) : targetMet ? (
              <Button size="sm" variant="secondary" onClick={onEdit}>
                Link the next step
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** One tracked rule of the compact card: its name, where it stands in words, and a track. */
function RuleLine({
  rule,
  name,
  value,
  bar,
  mark,
}: {
  /** Names the line: `data-rule`. */
  rule: string;
  name: ReactNode;
  value: ReactNode;
  bar?: { fraction: number; tone: BarTone };
  /** A tick on the track, 0 to 1. */
  mark?: number;
}): React.JSX.Element {
  return (
    <div
      data-rule={rule}
      className="border-t border-line py-2.5 first:border-t-0 first:pt-1"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px]">
        <span className="text-left text-text [&_button]:text-left">{name}</span>
        <span className="ml-auto text-right tabular-nums text-muted">
          {value}
        </span>
      </div>
      <div
        aria-hidden="true"
        data-track
        className="relative mt-1.5 h-1.5 rounded-full bg-sunken"
      >
        {bar ? (
          <i
            className={`absolute inset-y-0 left-0 block rounded-full ${BAR[bar.tone]}`}
            style={{ width: `${(clamp(bar.fraction) * 100).toFixed(1)}%` }}
          />
        ) : null}
        {mark !== undefined ? (
          <s
            className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded-[1px] bg-text no-underline"
            style={{ left: `${(clamp(mark) * 100).toFixed(1)}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * The phase's tracked rules, a line each with its figures and a track: profit,
 * daily loss, max drawdown, trading days, and best-day consistency where the
 * plan has it. Money reads in the account's own currency through the display.
 * Nothing for a phase with no rules to read.
 */
export function RuleLines({
  phase,
  className = '',
}: {
  phase: ChallengePhaseCheck;
  className?: string;
}): React.JSX.Element | null {
  const display = useDisplay();
  const account = phase.account;
  const rules = account?.propRules;
  const s = phase.state;
  if (!s || !rules || !account) return null;
  const money = (cents: Cents, signed = false) => (
    <FigureText f={display.cash(cents, signed, account.currency)} />
  );
  const funded = phase.step === 'funded';
  const used = rules.maxDrawdown - s.drawdown.remaining;
  return (
    <div className={`flex flex-col ${className}`}>
      <RuleLine
        rule="profit"
        name={
          <MetricTip
            id={funded ? 'prop-profit-funded' : 'prop-profit'}
            basis="net"
          >
            {funded ? 'Profit' : 'Profit target'}
          </MetricTip>
        }
        value={
          funded ? (
            <>{money(s.profit.current, true)}, no target once funded</>
          ) : (
            <>
              {money(s.profit.current, true)} of {money(s.profit.target)}
              {s.overall === 'target-reached' ? ', reached' : ''}
            </>
          )
        }
        bar={
          funded
            ? undefined
            : {
                fraction: s.profit.progress,
                tone: s.overall === 'target-reached' ? 'gain' : 'accent',
              }
        }
      />
      <RuleLine
        rule="daily-loss"
        name={
          <MetricTip id="prop-daily-loss" basis="net">
            Daily loss
          </MetricTip>
        }
        value={
          s.dailyLoss.breachedOn ? (
            `limit broken on ${dayLabel(s.dailyLoss.breachedOn)}`
          ) : (
            <>
              {money(Math.max(0, -s.dailyLoss.todayNet))} of{' '}
              {money(s.dailyLoss.limit)} used today
            </>
          )
        }
        bar={{
          fraction: Math.max(0, -s.dailyLoss.todayNet) / s.dailyLoss.limit,
          tone: s.dailyLoss.remaining <= 0 ? 'loss' : 'accent',
        }}
      />
      <RuleLine
        rule="drawdown"
        name={
          <MetricTip id="prop-drawdown-left" basis="net">
            {`Max drawdown, ${drawdownLabel(s.drawdown.type)
              .replace(' drawdown', '')
              .toLowerCase()}`}
          </MetricTip>
        }
        value={
          s.drawdown.state === 'breached' ? (
            'limit broken'
          ) : (
            <>
              {money(Math.max(0, used))} of {money(rules.maxDrawdown)} used
            </>
          )
        }
        bar={{
          fraction: used / rules.maxDrawdown,
          tone: s.drawdown.state === 'clear' ? 'accent' : 'loss',
        }}
      />
      <RuleLine
        rule="trading-days"
        name={
          <MetricTip id="prop-trading-days" basis="net">
            Trading days
          </MetricTip>
        }
        value={`${s.tradingDays.count} of ${s.tradingDays.min}`}
        bar={{
          fraction:
            s.tradingDays.min === 0
              ? 1
              : s.tradingDays.count / s.tradingDays.min,
          tone: s.tradingDays.met ? 'gain' : 'accent',
        }}
      />
      {s.consistency ? (
        <RuleLine
          rule="consistency"
          name={
            <MetricTip id="prop-consistency" basis="net">
              Best day
            </MetricTip>
          }
          value={`${
            s.consistency.bestDayShare === null
              ? 'None'
              : `${(s.consistency.bestDayShare * 100).toFixed(1)}% of profit`
          }, limit ${Math.round(s.consistency.limitPct * 100)}%`}
          bar={{
            fraction: s.consistency.bestDayShare ?? 0,
            tone:
              s.consistency.bestDayShare !== null && !s.consistency.met
                ? 'loss'
                : 'accent',
          }}
          mark={s.consistency.limitPct}
        />
      ) : (
        <RuleLine
          rule="consistency"
          name={
            <MetricTip id="prop-consistency" basis="net">
              Best day
            </MetricTip>
          }
          value="not part of this plan"
        />
      )}
    </div>
  );
}

/**
 * The challenge as a dashboard widget draws it inside its own frame (C11): the
 * balance and the phase's five tracked rules, a line each with its figures and
 * a track, and the sentence when a rule has been broken. The frame carries the
 * name, the firm, the phase and the status chip; the card's editing, the
 * suggestions to mark it breached or passed and the rules' small print stay on
 * the Prop firms page, one link away. Money reads in the challenge's own
 * currency through the display, so Privacy hides it.
 */
export function ChallengeCompact({
  challenge: c,
  check,
}: {
  challenge: Challenge;
  check: ChallengeCheck;
}): React.JSX.Element {
  const display = useDisplay();
  const phase = shownPhase(c, check);
  const account = phase?.account;
  const rules = account?.propRules;
  const s = phase?.state;
  const currency = account?.currency ?? 'USD';
  const money = (cents: Cents, signed = false) => (
    <FigureText f={display.cash(cents, signed, currency)} />
  );
  const text = (cents: Cents) => display.cash(cents, false, currency);
  const finding =
    c.status !== 'breached' && check.health === 'breached'
      ? check.finding
      : undefined;
  const sentence = finding
    ? (() => {
        const shown = findingText(finding, (v) => text(v).text);
        const spoken = findingText(finding, (v) => text(v).label);
        return shown === spoken ? (
          shown
        ) : (
          <>
            <span aria-hidden="true">{shown}</span>
            <span className="sr-only">{spoken}</span>
          </>
        );
      })()
    : null;

  return (
    <div className="mt-3 flex flex-1 flex-col">
      {phase?.archived ? (
        <p className="text-[12.5px] font-medium text-warn">Account archived</p>
      ) : phase?.balance !== undefined && account ? (
        <p className="flex flex-wrap items-baseline gap-x-2.5">
          <b className="text-[24px] leading-tight font-semibold tracking-[-0.03em] tabular-nums">
            {money(phase.balance)}
          </b>
          <span className="text-[12.5px] text-muted">
            from {money(account.startingBalance)}
          </span>
        </p>
      ) : null}
      {c.status === 'breached' ? (
        <BreachLine c={c} privacy={display.unit === 'privacy'} />
      ) : null}
      <div role="status" className="empty:hidden">
        {sentence ? (
          <p className="mt-2 rounded-control bg-loss-soft/60 px-3 py-2 text-[12.5px] leading-snug font-medium text-text">
            {sentence}
          </p>
        ) : null}
      </div>
      {s && rules && account ? (
        <RuleLines phase={phase!} className="mt-2.5" />
      ) : (
        <p className="mt-3 text-[13px] leading-snug text-muted">
          {phase?.archived
            ? 'Its account is archived, so Keel has no rules to read here.'
            : phase?.accountId
              ? "No rules yet. Add the firm's limits on the Prop firms page and Keel tracks this phase."
              : 'No account linked to this phase yet. Link one on the Prop firms page.'}
        </p>
      )}
      <div className="mt-auto pt-3">
        <Link
          href="/app/prop-firms"
          className="inline-flex min-h-6 items-center rounded-chip text-[12.5px] font-semibold text-accent-ink outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
        >
          Open Prop firms
        </Link>
      </div>
    </div>
  );
}
