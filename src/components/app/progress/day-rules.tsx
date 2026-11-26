'use client';

import { CheckCircle, Clock, XCircle } from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { TaskCheckbox } from '@/components/ui/task-checkbox';
import type { DayScore, RuleResult, RuleStatus } from '@/domain/tracker/score';
import type { TrackerStage, TrackerVersion } from '@/domain/types';
import { ruleName, tradeCap, useNetCash } from './rule-label';

const STAGES: readonly { stage: TrackerStage; title: string }[] = [
  { stage: 'prepare', title: 'Prepare' },
  { stage: 'trade', title: 'Trade' },
  { stage: 'reflect', title: 'Reflect' },
];

const STATUS_WORD: Record<RuleStatus, string> = {
  met: 'Met',
  failed: 'Failed',
  pending: 'Pending',
};

/** K19: met is a gain-coloured check, failed a loss-coloured cross, pending a faint clock. */
export function Mark({ status }: { status: RuleStatus }): React.JSX.Element {
  const Icon =
    status === 'met' ? CheckCircle : status === 'failed' ? XCircle : Clock;
  const tone =
    status === 'met'
      ? 'text-gain-fill'
      : status === 'failed'
        ? 'text-loss-fill'
        : 'text-faint';
  return (
    <span
      data-mark={status}
      className={`inline-grid size-5 flex-none place-items-center ${tone}`}
    >
      <Icon
        size={status === 'pending' ? 17 : 18}
        weight={status === 'pending' ? 'regular' : 'fill'}
        aria-hidden="true"
      />
      <span className="sr-only">{STATUS_WORD[status]}</span>
    </span>
  );
}

/** The right-hand value: the figure over a small unit line. */
function Value({
  main,
  small,
  loss,
}: {
  main: React.ReactNode;
  small?: React.ReactNode;
  loss: boolean;
}): React.JSX.Element {
  return (
    <span className="flex-none text-right text-[13px] leading-snug font-[550] whitespace-nowrap tabular-nums">
      <span className={loss ? 'text-loss' : undefined}>{main}</span>
      {small !== undefined ? (
        <span className="block text-[12px] font-normal text-faint">
          {small}
        </span>
      ) : null}
    </span>
  );
}

/**
 * One day's rules in three groups, each with its status mark. `values`: the
 * tracker page's checklist, every value on the right. `names`: the day page's
 * card, the mark and the name only, and the start rule's logged time. Custom
 * rules tick unless the day is read-only. Money goes through the Display, so
 * Privacy masks it.
 */
export function DayRules({
  score,
  version,
  readOnly,
  detail,
  onTick,
  currency,
}: {
  score: DayScore;
  version: TrackerVersion;
  readOnly: boolean;
  detail: 'values' | 'names';
  onTick(ruleId: string, ticked: boolean): void;
  currency: string;
}): React.JSX.Element {
  const fmt = useNetCash(currency);
  const values = detail === 'values';

  const valueOf = (r: RuleResult): React.ReactNode => {
    const v = r.value;
    const loss = r.status === 'failed';
    switch (v.kind) {
      case 'time':
        if (!values)
          return v.at !== undefined ? <Value main={v.at} loss={false} /> : null;
        return (
          <Value main={v.at ?? 'None'} small={`by ${v.limit}`} loss={loss} />
        );
      case 'share':
        if (!values) return null;
        return (
          <Value
            main={`${v.x} of ${v.y}`}
            small={
              r.key === 'lossPerTrade' ? (
                <>within {tradeCap(version, fmt)}</>
              ) : (
                'trades'
              )
            }
            loss={loss}
          />
        );
      case 'money':
        if (!values) return null;
        return (
          <Value
            main={<FigureText f={fmt(v.cents)} />}
            small={
              <>
                of <FigureText f={fmt(v.limit)} />
              </>
            }
            loss={loss}
          />
        );
      case 'tick':
        return null;
    }
  };

  return (
    <div>
      {STAGES.map(({ stage, title }) => {
        const rules = score.rules.filter((r) => r.stage === stage);
        if (rules.length === 0) return null;
        return (
          <div key={stage}>
            <h3 className="mt-3.5 mb-0.5 text-[12.5px] font-medium text-faint first:mt-1.5">
              {title}
            </h3>
            {rules.map((r) => {
              const name = ruleName(r.key, version, fmt);
              const custom = r.key.startsWith('custom:');
              const ticked = r.value.kind === 'tick' && r.value.ticked;
              // A failed custom rule on a read-only day is a verdict, not a box.
              const asMark = !custom || (readOnly && r.status === 'failed');
              return (
                <div
                  key={r.key}
                  data-rule={r.key}
                  data-status={r.status}
                  className="flex min-h-12 items-center gap-3 border-t border-line/70 py-[7px] first-of-type:border-t-0"
                >
                  {asMark ? (
                    <Mark status={r.status} />
                  ) : (
                    <span className="flex size-5 flex-none items-center justify-center leading-none [&>label]:justify-center">
                      <TaskCheckbox
                        checked={ticked}
                        disabled={readOnly}
                        aria-label={name}
                        onCheckedChange={(next) =>
                          onTick(r.key.slice('custom:'.length), next)
                        }
                      />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13.5px] leading-[1.35] font-medium">
                      {name}
                    </b>
                    {custom && values ? (
                      <small className="mt-px block text-[12.5px] text-faint">
                        Tick it yourself
                      </small>
                    ) : null}
                  </span>
                  {valueOf(r)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
