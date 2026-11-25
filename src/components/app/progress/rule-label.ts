import type { Cents, TrackerStage, TrackerVersion } from '@/domain/types';
import type { RuleKey } from '@/domain/tracker/score';

/** An amount as text; the page builds it from `useDisplay().cash`, so Privacy masks it. */
export type FormatMoney = (cents: Cents) => { text: string; label: string };

/** A fraction as a whole-number percent, "1%" or "2.5%". */
const pct = (f: number): string => `${Number((f * 100).toFixed(2))}%`;

const customOf = (key: RuleKey, version: TrackerVersion) =>
  key.startsWith('custom:')
    ? version.custom.find((c) => c.id === key.slice('custom:'.length))
    : undefined;

/** The limit on one trade's loss, as the version sets it: "$100" or "1%". */
export function tradeCap(version: TrackerVersion, fmt: FormatMoney): string {
  const { unit, value } = version.builtIn.lossPerTrade;
  return unit === 'amount' ? fmt(value).text.replace(/\.00$/, '') : pct(value);
}

/** The rule as a sentence, in Keel's words (comps 01 and 02). */
export function ruleName(
  key: RuleKey,
  version: TrackerVersion,
  fmt: FormatMoney,
): string {
  const b = version.builtIn;
  switch (key) {
    case 'startBy':
      return `Start the day note by ${b.startBy.time}`;
    case 'hours':
      return `Trade only between ${b.hours.from} and ${b.hours.to}`;
    case 'strategy':
      return 'Every trade has a strategy';
    case 'stop':
      return 'Every trade has a planned stop';
    case 'lossPerTrade':
      return `Keep every loss to ${tradeCap(version, fmt)} or less`;
    case 'lossPerDay':
      return `Keep the day's loss to ${fmt(b.lossPerDay.amount).text.replace(/\.00$/, '')} or less`;
    default:
      return customOf(key, version)?.name ?? 'Removed rule';
  }
}

/** The rule's condition, the short form the rules table shows. */
export function ruleCondition(
  key: RuleKey,
  version: TrackerVersion,
  fmt: FormatMoney,
): string {
  const b = version.builtIn;
  switch (key) {
    case 'startBy':
      return `By ${b.startBy.time}`;
    case 'hours':
      return `${b.hours.from} to ${b.hours.to}`;
    case 'strategy':
    case 'stop':
      return 'All trades';
    case 'lossPerTrade':
      return `${tradeCap(version, fmt)} a trade`;
    case 'lossPerDay':
      return `${fmt(b.lossPerDay.amount).text.replace(/\.00$/, '')} a day`;
    default:
      return 'Ticked by hand';
  }
}

/** The stage as the rules table names it. */
export const STAGE_NAME: Record<TrackerStage, string> = {
  prepare: 'Prepare',
  trade: 'Trade',
  reflect: 'Reflect',
};
