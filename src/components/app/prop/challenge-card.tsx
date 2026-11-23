'use client';

import {
  CheckCircle,
  ShieldCheck,
  Trophy,
  XCircle,
} from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';
import { CARD, signTone } from '@/components/app/dashboard/shared';
import { FigureText } from '@/components/product/figure-text';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { IconTile, type TileTone } from '@/components/ui/icon-tile';
import { MetricTip } from '@/components/ui/metric-tip';
import type { ChallengePatch } from '@/data/repository';
import {
  drawdownLabel,
  findingText,
  type ChallengeCheck,
  type ChallengePhaseCheck,
} from '@/domain/prop/challenge';
import type { Cents, Challenge, ChallengeStep } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';

/** "Thu 19 Nov". */
function dayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** A plain-text amount for what is saved: dollars as the account holds them, never the display unit. */
export function plainMoney(c: Cents, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    c / 100,
  );
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

function phaseLabel(c: Challenge, step: ChallengeStep): string {
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

/** One tracked figure: its label, a value, a bar and a line under it. */
function Track({
  tip,
  note,
  value,
  tone = '',
  bar,
  mark,
  children,
}: {
  tip: ReactNode;
  /** Beside the label, at the right. */
  note?: string;
  value: ReactNode;
  tone?: string;
  bar?: { fraction: number; tone: BarTone };
  /** A tick on the bar, 0 to 1. */
  mark?: number;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-w-0 border-t border-line px-4 pt-3.5 pb-3 lg:border-t-0 lg:border-l">
      <div className="flex items-baseline gap-1.5 text-[12px] whitespace-nowrap text-faint">
        {tip}
        {note ? (
          <em className="ml-auto truncate text-[12px] text-muted not-italic">
            {note}
          </em>
        ) : null}
      </div>
      <b
        className={`mt-1 block text-[18px] font-semibold tracking-[-0.025em] whitespace-nowrap tabular-nums ${tone}`}
      >
        {value}
      </b>
      <div
        aria-hidden="true"
        className="relative mt-2 h-1.5 rounded-full bg-sunken"
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
      <small className="mt-1.5 block text-[12px] leading-[1.4] text-faint">
        {children}
      </small>
    </div>
  );
}

const STATUS = {
  active: { tone: 'accent', label: 'Active' },
  near: { tone: 'loss', label: 'Near a limit' },
  breached: { tone: 'loss', label: 'Breached' },
  passed: { tone: 'gain', label: 'Passed' },
} as const;

function StatusChip({
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
 * One challenge: who it is and where it stands (name, firm, phase, status,
 * balance, fees, the reason it failed), the phase's five tracked rules, a
 * suggestion when the numbers say the status is out of date, and its rules.
 * The status is the trader's: the suggestion changes nothing until it is
 * accepted.
 */
export function ChallengeCard({
  challenge: c,
  check,
  today,
  saving,
  saveFailed,
  onEdit,
  onSave,
}: {
  challenge: Challenge;
  check: ChallengeCheck;
  today: string;
  saving: boolean;
  saveFailed: boolean;
  onEdit(): void;
  onSave(patch: ChallengePatch): void;
}): React.JSX.Element {
  const display = useDisplay();
  const headingId = `challenge-${c.id}`;
  const phase = shownPhase(c, check);
  const account = phase?.account;
  const rules = account?.propRules;
  const s = phase?.state;
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
  const evalPhases = check.phases.filter((p) => p.step !== 'funded');
  const passedEval =
    c.phase === 'evaluation' &&
    evalPhases.length > 0 &&
    evalPhases.every((p) => p.state?.overall === 'target-reached') &&
    !check.phases.some((p) => p.step === 'funded' && p.accountId);
  const chip: keyof typeof STATUS =
    c.status === 'breached'
      ? 'breached'
      : check.health === 'near'
        ? 'near'
        : passedEval
          ? 'passed'
          : 'active';
  const funded = phase?.step === 'funded';
  const tile: { tone: TileTone; icon: typeof ShieldCheck } =
    chip === 'passed'
      ? { tone: 'gain', icon: Trophy }
      : {
          tone: c.status === 'breached' ? 'loss' : 'accent',
          icon: ShieldCheck,
        };

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

  const period = s?.period;
  const daysNote = !rules
    ? ''
    : rules.periodDays === undefined
      ? 'no time limit'
      : period?.ended
        ? 'period ended'
        : period && period.daysLeft === 0
          ? 'last day'
          : period
            ? `${period.daysLeft} ${plural(period.daysLeft, 'day')} left`
            : `${rules.periodDays} days from the first trade`;

  return (
    <article
      aria-labelledby={headingId}
      className={`${CARD} grid grid-cols-2 overflow-hidden lg:grid-cols-[288px_repeat(5,minmax(0,1fr))]`}
    >
      <div className="col-span-2 flex flex-col gap-2 px-5 pt-3.5 pb-3 lg:col-span-1">
        <div className="flex items-center gap-2.5">
          <IconTile icon={tile.icon} tone={tile.tone} />
          <div className="min-w-0">
            <h2
              id={headingId}
              className="text-[15px] leading-tight font-semibold tracking-[-0.015em]"
            >
              {c.name}
            </h2>
            <span className="text-[12px] text-faint">{c.firm}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-[22px] items-center rounded-[7px] bg-sunken px-2 text-xs font-semibold text-muted">
            {phase ? phaseLabel(c, phase.step) : 'Evaluation'}
          </span>
          <StatusChip kind={chip} />
        </div>
        {phase?.archived ? (
          <p className="text-[12.5px] font-medium text-warn">
            Account archived
          </p>
        ) : phase?.balance !== undefined && account ? (
          <p className="text-[12.5px] text-muted">
            Balance {money(phase.balance)} from {money(account.startingBalance)}
          </p>
        ) : null}
        {c.status === 'breached' && c.failureReason ? (
          <p className="text-[12.5px] font-semibold text-loss">
            {maskedReason(c.failureReason, display.unit === 'privacy').replace(
              /−(?=\S)/g,
              '−\u2060',
            )}
          </p>
        ) : null}
        {c.evaluationFee !== undefined || c.activationFee !== undefined ? (
          <p className="text-[12px] text-faint">
            Fees {money(c.evaluationFee ?? 0)} + {money(c.activationFee ?? 0)}
          </p>
        ) : null}
      </div>

      {s && rules && account ? (
        <>
          <Track
            tip={
              <MetricTip
                id={funded ? 'prop-profit-funded' : 'prop-profit'}
                basis="net"
              />
            }
            value={money(s.profit.current, true)}
            tone={signTone(s.profit.current)}
            bar={
              funded
                ? undefined
                : {
                    fraction: s.profit.progress,
                    tone: s.overall === 'target-reached' ? 'gain' : 'accent',
                  }
            }
          >
            {funded ? (
              phase?.paidOut ? (
                <>no target once funded, {money(phase.paidOut)} paid out</>
              ) : (
                'no target once funded'
              )
            ) : s.overall === 'target-reached' ? (
              <>target reached, {money(s.profit.target)}</>
            ) : (
              <>
                {Math.round(s.profit.progress * 100)}% of{' '}
                {money(s.profit.target)}
              </>
            )}
          </Track>
          <Track
            tip={<MetricTip id="prop-drawdown-left" basis="net" />}
            value={money(Math.max(0, s.drawdown.remaining))}
            tone={s.drawdown.state === 'clear' ? '' : 'text-loss'}
            bar={{
              fraction: s.drawdown.remaining / rules.maxDrawdown,
              tone: s.drawdown.state === 'clear' ? 'accent' : 'loss',
            }}
          >
            {s.drawdown.state === 'breached' ? (
              <>
                <span className="block text-muted">
                  {drawdownLabel(s.drawdown.type)}
                </span>
                limit broken
              </>
            ) : (
              <>
                <span className="block text-muted">
                  {drawdownLabel(s.drawdown.type)}
                </span>
                of {money(rules.maxDrawdown)}, floor {money(s.drawdown.floor)}
              </>
            )}
          </Track>
          <Track
            tip={<MetricTip id="prop-daily-loss" basis="net" />}
            note={dayLabel(today)}
            value={money(s.dailyLoss.todayNet, true)}
            tone={signTone(s.dailyLoss.todayNet)}
            bar={{
              fraction: Math.max(0, -s.dailyLoss.todayNet) / s.dailyLoss.limit,
              tone: s.dailyLoss.remaining <= 0 ? 'loss' : 'accent',
            }}
          >
            {s.dailyLoss.breachedOn ? (
              `limit broken on ${dayLabel(s.dailyLoss.breachedOn)}`
            ) : (
              <>
                {money(Math.max(0, s.dailyLoss.remaining))} left of{' '}
                {money(s.dailyLoss.limit)}
              </>
            )}
          </Track>
          <Track
            tip={<MetricTip id="prop-trading-days" basis="net" />}
            value={
              <>
                {s.tradingDays.count}{' '}
                <span className="text-[14px] font-medium text-muted">
                  of {s.tradingDays.min}
                </span>
              </>
            }
            bar={{
              fraction:
                s.tradingDays.min === 0
                  ? 1
                  : s.tradingDays.count / s.tradingDays.min,
              tone: s.tradingDays.met ? 'gain' : 'accent',
            }}
          >
            {s.tradingDays.met
              ? 'minimum met'
              : `${s.tradingDays.min - s.tradingDays.count} more needed`}
            {daysNote ? `, ${daysNote}` : ''}
          </Track>
          {s.consistency ? (
            <Track
              tip={<MetricTip id="prop-consistency" basis="net" />}
              value={
                s.consistency.bestDayShare === null
                  ? 'None'
                  : `${(s.consistency.bestDayShare * 100).toFixed(1)}%`
              }
              tone={
                s.consistency.bestDayShare !== null && !s.consistency.met
                  ? 'text-loss'
                  : ''
              }
              bar={{
                fraction: s.consistency.bestDayShare ?? 0,
                tone:
                  s.consistency.bestDayShare !== null && !s.consistency.met
                    ? 'loss'
                    : 'accent',
              }}
              mark={s.consistency.limitPct}
            >
              best day share, {Math.round(s.consistency.limitPct * 100)}% max
            </Track>
          ) : (
            <Track
              tip={<MetricTip id="prop-consistency" basis="net" />}
              value={<span className="text-muted">None</span>}
            >
              not part of this plan
            </Track>
          )}
        </>
      ) : (
        <div className="col-span-2 flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 text-[13px] text-muted lg:col-span-5 lg:border-t-0 lg:border-l">
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
      )}

      {/* The card's one live region: always mounted, so a change in it is announced. */}
      <div role="status" className="col-span-full empty:hidden">
        {sentence || targetMet || saveFailed ? (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-loss-soft/60 px-5 py-2.5 text-[13px] data-[kind=met]:bg-gain-soft/60"
            data-kind={targetMet && !sentence ? 'met' : 'breach'}
          >
            <span className="min-w-0 flex-1 font-medium text-text">
              {sentence ??
                (targetMet
                  ? lastMet
                    ? 'The profit target is met, with the minimum days and consistency.'
                    : 'This step is on target. Link the next step in Edit to carry on.'
                  : null)}
              {saveFailed ? (
                <span className="ml-2 text-loss">
                  Couldn&apos;t save that. Try again.
                </span>
              ) : null}
            </span>
            {sentence && finding ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() =>
                  onSave({
                    status: 'breached',
                    failureReason: findingText(finding, (v) =>
                      plainMoney(v, currency),
                    ),
                  })
                }
              >
                Mark as breached
              </Button>
            ) : lastMet ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => onSave({ status: 'active', phase: 'funded' })}
              >
                Mark step passed
              </Button>
            ) : targetMet ? (
              <Button size="sm" variant="secondary" onClick={onEdit}>
                Link the next step
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="col-span-full flex items-center gap-3 border-t border-line bg-sunken/55 px-5 py-1.5 text-[12px] text-faint">
        <span className="min-w-0 flex-1">
          {rules && account ? (
            <>
              Rules: {funded ? null : <>target {money(rules.profitTarget)}, </>}
              daily loss {money(rules.dailyLossLimit)}, max drawdown{' '}
              {money(rules.maxDrawdown)}{' '}
              {drawdownLabel(rules.drawdownType)
                .replace(' drawdown', '')
                .toLowerCase()}
              , at least {rules.minTradingDays} trading{' '}
              {plural(rules.minTradingDays, 'day')}
              {rules.consistencyPct !== undefined
                ? `, best day ${Math.round(rules.consistencyPct * 100)}% max`
                : ''}
              {funded
                ? ''
                : rules.periodDays !== undefined
                  ? `, ${rules.periodDays} days`
                  : ', no time limit'}
              .
            </>
          ) : (
            'No rules set for this phase.'
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${c.name}`}
          className="h-8 px-2 text-[12.5px] font-semibold text-accent-ink! pointer-coarse:h-11"
        >
          Edit
        </Button>
      </div>
    </article>
  );
}
