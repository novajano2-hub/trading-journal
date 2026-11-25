'use client';

import { PencilSimple } from '@phosphor-icons/react/dist/ssr';
import { FigureText } from '@/components/product/figure-text';
import { buttonClasses } from '@/components/ui/button-styles';
import { MetricTip } from '@/components/ui/metric-tip';
import type { DayScore, RuleKey, RuleStatus } from '@/domain/tracker/score';
import type { RuleStat } from '@/domain/tracker/summary';
import type { TrackerStage, TrackerVersion } from '@/domain/types';
import { useDisplay } from '@/lib/display';
import { plural } from '@/lib/format';
import { CARD, CARD_PAD, Caption, CardHeader } from '../dashboard/shared';
import { Mark } from './day-rules';
import {
  ruleCondition,
  ruleName,
  STAGE_NAME,
  type FormatMoney,
} from './rule-label';

const STAGE_ORDER = { prepare: 0, trade: 1, reflect: 2 } as const;

/** The rules the version in effect today has on, with their stage. */
function currentRules(
  version: TrackerVersion,
): { key: RuleKey; stage: TrackerStage }[] {
  const b = version.builtIn;
  const built: { key: RuleKey; stage: TrackerStage; on: boolean }[] = [
    { key: 'startBy', stage: 'prepare', on: b.startBy.on },
    { key: 'hours', stage: 'trade', on: b.hours.on },
    { key: 'strategy', stage: 'reflect', on: b.strategy.on },
    { key: 'stop', stage: 'reflect', on: b.stop.on },
    { key: 'lossPerTrade', stage: 'reflect', on: b.lossPerTrade.on },
    { key: 'lossPerDay', stage: 'reflect', on: b.lossPerDay.on },
  ];
  return [
    ...built.filter((r) => r.on),
    ...version.custom.map((c) => ({
      key: `custom:${c.id}` as RuleKey,
      stage: c.stage,
    })),
  ];
}

const hhmm = (minutes: number): string => {
  const m = Math.round(minutes);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

interface Row {
  key: RuleKey;
  name: string;
  stage: string;
  condition: string;
  streak: string;
  average: React.ReactNode;
  /** The average is empty. */
  none: boolean;
  /** Whole percent, or null with no decided day. */
  follow: number | null;
  title: string;
  status: RuleStatus | undefined;
}

/**
 * The tracker's current rules, one row each, in stage order (the sort is
 * stable, so a stage keeps the built-ins first, then the custom rules in
 * their order). `stats` holds every rule that ever scored; a rule that does
 * not apply today has no mark.
 */
function useRows(
  stats: readonly RuleStat[],
  version: TrackerVersion,
  today: DayScore,
  currency: string,
): Row[] {
  const display = useDisplay();
  // The tracker is always net, in the rule's own currency.
  const fmt: FormatMoney = (cents) => display.cash(cents, false, currency);
  // Every current rule has a row; one with no scored day reads zeros, as
  // TradeZella's nothing-done state does.
  const seen = new Map(stats.map((s) => [s.key, s]));
  return currentRules(version)
    .map(
      ({ key, stage }): RuleStat =>
        seen.get(key) ?? {
          key,
          stage,
          streak: 0,
          average: null,
          followRate: 0,
          scoredDays: 0,
        },
    )
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage])
    .map((s) => {
      const custom = s.key.startsWith('custom:');
      const avg = s.average;
      let average: React.ReactNode;
      if (avg === null) average = 'None';
      else if (s.key === 'startBy') average = hhmm(avg);
      else if (s.key === 'lossPerTrade' || s.key === 'lossPerDay')
        average = <FigureText f={fmt(Math.round(avg))} />;
      else average = `${Math.round(avg * 100)}%`;
      const met =
        s.followRate === null ? 0 : Math.round(s.followRate * s.scoredDays);
      return {
        key: s.key,
        name: ruleName(s.key, version, fmt),
        stage: custom
          ? `${STAGE_NAME[s.stage]}, ticked by hand`
          : STAGE_NAME[s.stage],
        condition: ruleCondition(s.key, version, fmt),
        streak: `${s.streak} ${plural(s.streak, 'day')}`,
        average,
        none: avg === null,
        follow: s.followRate === null ? null : Math.round(s.followRate * 100),
        title:
          s.followRate === null || s.scoredDays === 0
            ? 'No scored days yet'
            : `${met} of ${s.scoredDays} scored ${plural(s.scoredDays, 'day')}`,
        status: today.rules.find((r) => r.key === s.key)?.status,
      };
    });
}

function FollowBar({ row }: { row: Row }): React.JSX.Element {
  return (
    <span className="flex items-center gap-2.5" title={row.title}>
      <span
        aria-hidden="true"
        className="relative h-1.5 flex-1 overflow-hidden rounded-[3px] bg-accent-soft"
      >
        <i
          className="absolute inset-y-0 left-0 rounded-[3px] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--accent)_78%,#fff),var(--accent))]"
          style={{ width: `${row.follow ?? 0}%` }}
        />
      </span>
      <b className="w-[38px] text-right text-[13px] font-[550] tabular-nums">
        {row.follow === null ? 'None' : `${row.follow}%`}
      </b>
    </span>
  );
}

const TH =
  'h-[34px] border-b border-line pr-2.5 text-left text-xs font-medium whitespace-nowrap text-faint last:pr-0';
const TD =
  'h-[52px] border-b border-line/70 pr-2.5 align-middle whitespace-nowrap last:pr-0';

/**
 * The rules card: the current rules with today's mark, the condition, the
 * streak, the average and the follow rate over the date range. Wide, a table;
 * narrow, two-line rows (by the card's own width, not the screen's).
 */
export function RulesTable({
  stats,
  version,
  today,
  currency,
  caption,
  onEdit,
}: {
  stats: readonly RuleStat[];
  version: TrackerVersion;
  today: DayScore;
  currency: string;
  /** The range and the scored days in it, "1-24 Nov, 17 scored days". */
  caption: string;
  /** Gets the button that was pressed, for the dialog to grow from. */
  onEdit(opener: HTMLElement): void;
}): React.JSX.Element {
  const rows = useRows(stats, version, today, currency);
  return (
    <section
      aria-labelledby="rules-title"
      className={`${CARD} ${CARD_PAD} @container min-w-0`}
    >
      <CardHeader
        headingId="rules-title"
        title="Rules"
        after={<Caption>{caption}</Caption>}
        end={
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={(e) => onEdit(e.currentTarget)}
            className={`${buttonClasses('secondary', 'sm')} gap-2`}
          >
            <PencilSimple size={15} aria-hidden="true" className="flex-none" />
            Edit rules
          </button>
        }
      />
      <table className="mt-1.5 hidden w-full table-fixed border-collapse text-[13px] @[41rem]:table">
        <colgroup>
          <col className="w-[52px]" />
          <col />
          <col className="w-[136px]" />
          <col className="w-[76px]" />
          <col className="w-[88px]" />
          <col className="w-[140px]" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={TH}>
              Today
            </th>
            <th scope="col" className={TH}>
              Rule
            </th>
            <th scope="col" className={TH}>
              Condition
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <MetricTip id="rule-streak" basis="net" />
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <MetricTip id="rule-average" basis="net" />
            </th>
            <th scope="col" className={TH}>
              <MetricTip id="rule-follow-rate" basis="net" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-rule={r.key}>
              <td className={TD}>
                {r.status ? (
                  <Mark status={r.status} />
                ) : (
                  <span className="sr-only">Not scored today</span>
                )}
              </td>
              <td className={`${TD} whitespace-normal`}>
                <span className="block leading-[1.35] font-medium">
                  {r.name}
                </span>
                <small className="mt-px block text-xs text-faint">
                  {r.stage}
                </small>
              </td>
              <td className={`${TD} whitespace-normal text-muted`}>
                {r.condition}
              </td>
              <td className={`${TD} text-right font-[550] tabular-nums`}>
                {r.streak}
              </td>
              <td
                className={`${TD} text-right tabular-nums ${r.none ? 'text-muted' : 'font-[550]'}`}
              >
                {r.average}
              </td>
              <td className={TD}>
                <FollowBar row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="mt-1.5 @[41rem]:hidden" aria-label="Rules">
        {rows.map((r) => (
          <li
            key={r.key}
            data-rule={r.key}
            className="flex gap-2.5 border-t border-line/70 py-[11px] first:border-t-0"
          >
            {r.status ? (
              <Mark status={r.status} />
            ) : (
              <span className="size-5 flex-none" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2.5">
                <b className="text-sm leading-[1.35] font-medium">{r.name}</b>
                <b className="ml-auto text-[13px] font-semibold tabular-nums">
                  {r.follow === null ? 'None' : `${r.follow}%`}
                </b>
              </span>
              <span className="mt-[3px] flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-muted">
                <span>{r.condition}</span>
                <span>Streak {r.streak}</span>
                <span>Avg {r.average}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
