'use client';

import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle,
  Info,
  XCircle,
} from '@phosphor-icons/react/dist/ssr';
import type { MetricContext } from '@/domain/metrics/context';
import { ruleApplies } from '@/domain/rule-applies';
import type { Rule, RuleShowWhen, Strategy, Trade } from '@/domain/types';
import { plural } from '@/lib/format';

const WHEN_WORDS: Record<Exclude<RuleShowWhen, 'always'>, string> = {
  winner: 'winning',
  loser: 'losing',
  breakeven: 'breakeven',
};

/** The rule's grade on this trade: kept, broken, or null while not graded. */
function gradeOf(trade: Trade, ruleId: string): boolean | null {
  return trade.ruleChecks.find((c) => c.ruleId === ruleId)?.followed ?? null;
}

const SEG =
  'inline-flex h-[26px] items-center gap-[5px] rounded-[7px] px-2 text-[12.5px] font-medium text-faint outline-offset-0 hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-faint pointer-coarse:h-11 pointer-coarse:px-3';
const SEG_ON =
  'bg-surface-1 font-semibold text-text shadow-[var(--shadow-chip)] [[data-theme=dark]_&]:bg-line-2';

/** Kept or Broken, each pressed on its own; pressing the chosen one again leaves the rule not graded. */
function Grade({
  rule,
  grade,
  disabled,
  onChange,
}: {
  rule: Rule;
  grade: boolean | null;
  disabled: boolean;
  onChange(next: boolean | null): void;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={rule.text}
      className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-2"
    >
      <p
        aria-hidden="true"
        className={`min-w-0 flex-1 text-[14px] leading-[1.4] font-medium text-pretty ${grade === null ? 'text-muted' : 'text-text'}`}
      >
        {rule.text}
      </p>
      <span className="inline-flex flex-none gap-0.5 rounded-[9px] bg-sunken p-0.5">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={grade === true}
          onClick={() => onChange(grade === true ? null : true)}
          className={`${SEG} ${grade === true ? SEG_ON : ''}`}
        >
          <CheckCircle
            size={14}
            weight={grade === true ? 'fill' : 'regular'}
            aria-hidden="true"
            className={grade === true ? 'text-gain-fill' : 'opacity-45'}
          />
          Kept
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={grade === false}
          onClick={() => onChange(grade === false ? null : false)}
          className={`${SEG} ${grade === false ? `${SEG_ON} text-loss` : ''}`}
        >
          <XCircle
            size={14}
            weight={grade === false ? 'fill' : 'regular'}
            aria-hidden="true"
            className={grade === false ? 'text-loss-fill' : 'opacity-45'}
          />
          Broken
        </button>
      </span>
    </div>
  );
}

/** What the strategy's hidden rules are, in a sentence. */
function hiddenNote(hidden: Rule[], open: boolean): string | null {
  if (hidden.length === 0) return null;
  if (open) {
    const n = hidden.length;
    return `${n} ${plural(n, 'rule')} will show once this trade closes, because ${n === 1 ? 'it depends' : 'they depend'} on the outcome: ${hidden.map((r) => r.text).join('; ')}`;
  }
  const by = new Map<RuleShowWhen, Rule[]>();
  for (const r of hidden)
    by.set(r.showWhen, [...(by.get(r.showWhen) ?? []), r]);
  return [...by]
    .map(([when, rules]) => {
      const n = rules.length;
      const words = WHEN_WORDS[when as keyof typeof WHEN_WORDS];
      return `${n} ${plural(n, 'rule')} ${n === 1 ? 'shows' : 'show'} on ${words} trades only, so ${n === 1 ? 'it is' : 'they are'} hidden here: ${rules.map((r) => r.text).join('; ')}`;
    })
    .join('. ');
}

/**
 * One strategy's rules for this trade, in the strategy's own titled groups.
 * Only the rules that apply to the trade's outcome are listed; the others are
 * named in a note. Each rule is graded Kept, Broken or left not graded.
 */
export function RuleChecklist({
  strategy,
  trade,
  ctx,
  readOnly,
  onGrade,
}: {
  strategy: Strategy;
  trade: Trade;
  ctx: Pick<MetricContext, 'pnlBasis' | 'breakevenRange'>;
  readOnly: boolean;
  onGrade(ruleId: string, next: boolean | null): void;
}): React.JSX.Element {
  const groups = strategy.groups.map((g) => ({
    ...g,
    shown: g.rules.filter((r) => ruleApplies(r, trade, ctx)),
  }));
  const all = strategy.groups.flatMap((g) => g.rules);
  const hidden = all.filter((r) => !ruleApplies(r, trade, ctx));
  const shown = groups.flatMap((g) => g.shown);
  const kept = shown.filter((r) => gradeOf(trade, r.id) === true).length;
  const broken = shown.filter((r) => gradeOf(trade, r.id) === false).length;
  const note = hiddenNote(hidden, trade.status === 'open');

  return (
    <section aria-label={`${strategy.name} rules`} className="mt-4 first:mt-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="text-[13.5px] font-semibold text-text">
          {strategy.name}
        </h3>
        {shown.length > 0 ? (
          <p className="ml-auto flex gap-2.5 text-[12.5px] text-muted tabular-nums">
            <span>
              <b className="font-semibold text-gain">{kept}</b> kept
            </span>
            <span>
              <b className={`font-semibold ${broken > 0 ? 'text-loss' : ''}`}>
                {broken}
              </b>{' '}
              broken
            </span>
          </p>
        ) : null}
      </div>
      {all.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-muted">
          This strategy has no rules yet.
        </p>
      ) : null}
      {groups.map((g) =>
        g.shown.length === 0 ? null : (
          <div key={g.id}>
            <h4 className="mt-3.5 mb-0.5 text-[12.5px] font-medium text-faint">
              {g.title}
            </h4>
            {g.shown.map((rule) => (
              <div
                key={rule.id}
                className="border-b border-line/70 py-1.5 last:border-b-0 [&>[role=group]]:min-h-11"
              >
                <Grade
                  rule={rule}
                  grade={gradeOf(trade, rule.id)}
                  disabled={readOnly}
                  onChange={(next) => onGrade(rule.id, next)}
                />
              </div>
            ))}
          </div>
        ),
      )}
      {note ? (
        <p className="mt-3 flex items-start gap-2 rounded-[10px] bg-sunken px-3 py-2.5 text-[12.5px] leading-[1.45] text-muted">
          <Info
            size={15}
            aria-hidden="true"
            className="mt-px flex-none text-faint"
          />
          <span>{note}</span>
        </p>
      ) : null}
      <Link
        href={`/app/strategies/${encodeURIComponent(strategy.id)}`}
        className="mt-2.5 inline-flex min-h-8 items-center gap-1.5 rounded-chip text-[13px] font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11"
      >
        {strategy.name}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
