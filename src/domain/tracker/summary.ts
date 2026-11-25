import type { TrackerStage } from '../types';
import type { DayScore, RuleKey } from './score';

const inRange = (d: DayScore, from?: string, to?: string): boolean =>
  (from === undefined || d.date >= from) && (to === undefined || d.date <= to);

const byDate = (days: readonly DayScore[]): DayScore[] =>
  [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const mean = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length;

/** K1: the mean of met/active over scored days with active > 0 in [from, to]; null with none. */
export function periodScore(
  days: readonly DayScore[],
  from?: string,
  to?: string,
): number | null {
  return mean(
    days
      .filter((d) => !d.unscored && d.active > 0 && inRange(d, from, to))
      .map((d) => d.met / d.active),
  );
}

/** K2: current is the run of perfect days ending today if today is perfect, else yesterday. */
export function streaks(
  days: readonly DayScore[],
  today: string,
): { current: number; best: number; perfect: number; scored: number } {
  const scored = byDate(days).filter((d) => !d.unscored);
  let best = 0;
  let run = 0;
  let perfect = 0;
  for (const d of scored) {
    if (d.perfect) {
      perfect += 1;
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }
  const upToToday = scored.filter((d) => d.date <= today);
  const last = upToToday[upToToday.length - 1];
  // Today still pending does not break the run: count back from the day before.
  const back =
    last && last.date === today && !last.perfect
      ? upToToday.slice(0, -1)
      : upToToday;
  let current = 0;
  for (let i = back.length - 1; i >= 0 && back[i]?.perfect; i--) current += 1;
  return { current, best, perfect, scored: scored.length };
}

export interface RuleStat {
  key: RuleKey;
  stage: TrackerStage;
  /** Followed days running back from today: 0 when today has failed [connector day]; counted from yesterday while today is pending (Keel's call, P6A-05). */
  streak: number;
  /** The mean of the non-null daily scores; null with none. For startBy it is the mean start time in minutes,
   *  shown as HH:mm (Keel's call, TradeZella's average with logged starts is UNKNOWN, P6A-06); with no logged
   *  start it is null, shown "None", as TradeZella's "--" [connector day]. */
  average: number | null;
  followRate: number | null;
  scoredDays: number;
}

export function ruleStats(
  days: readonly DayScore[],
  today: string,
  from?: string,
  to?: string,
): RuleStat[] {
  const sorted = byDate(days).filter((d) => !d.unscored);
  const stages = new Map<RuleKey, TrackerStage>();
  for (const d of sorted) {
    for (const r of d.rules) if (!stages.has(r.key)) stages.set(r.key, r.stage);
  }
  const ranged = sorted.filter((d) => inRange(d, from, to));
  return [...stages].map(([key, stage]) => {
    const results = (list: DayScore[]) =>
      list.flatMap((d) => {
        const r = d.rules.find((x) => x.key === key);
        return r ? [{ date: d.date, r }] : [];
      });
    const inPeriod = results(ranged);
    const decided = inPeriod.filter((x) => x.r.status !== 'pending');
    const met = decided.filter((x) => x.r.status === 'met').length;
    const scores = inPeriod.flatMap((x) =>
      x.r.score === null ? [] : [x.r.score],
    );

    const upToToday = results(sorted.filter((d) => d.date <= today));
    const last = upToToday[upToToday.length - 1];
    const start =
      last && last.date === today && last.r.status === 'pending'
        ? upToToday.length - 2
        : upToToday.length - 1;
    let streak = 0;
    for (let i = start; i >= 0 && upToToday[i]?.r.status === 'met'; i--)
      streak += 1;

    return {
      key,
      stage,
      streak,
      average: mean(scores),
      followRate: decided.length > 0 ? met / decided.length : null,
      scoredDays: decided.length,
    };
  });
}

export type GridStep = 0 | 1 | 2 | 3 | 4;

/** K12: none, under 1/3, under 2/3, short of all, all; null when unscored or nothing is active. */
export function gridStep(d: DayScore): GridStep | null {
  if (d.unscored || d.active === 0) return null;
  const share = d.met / d.active;
  if (share >= 1) return 4;
  if (share >= 2 / 3) return 3;
  if (share >= 1 / 3) return 2;
  return share > 0 ? 1 : 0;
}
