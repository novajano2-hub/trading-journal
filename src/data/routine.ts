import { TZDate } from '@date-fns/tz';
import { balanceAt, dayBefore } from '@/domain/metrics/balance';
import { realizations } from '@/domain/metrics/realized';
import { localDate, localParts } from '@/domain/time';
import { versionOn } from '@/domain/tracker/defaults';
import { dayInputs, stampTime, sumInputs } from '@/domain/tracker/inputs';
import { scoreDay, type DayScore } from '@/domain/tracker/score';
import type {
  Account,
  AccountDayInputs,
  CashFlow,
  DayRecord,
  FrozenDay,
  Trade,
  Tracker,
} from '@/domain/types';

export interface RoutineEnv {
  timeZone: string;
  baseCurrency: string;
  /** UTC ISO: the clock the day in progress is judged against. */
  now: string;
  /** The routine's today (K23). */
  today: string;
  /** The global selection; undefined: all. */
  accountIds?: readonly string[];
}

export interface ScoreHistory {
  tracker: Tracker;
  today: string;
  /** startedOn to today, ascending. */
  days: DayScore[];
  byDate: ReadonlyMap<string, DayScore>;
  scoreOn(date: string): DayScore;
}

const dayAfter = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** The trades that touch each local date: the one they opened on, and each exit's. Built once. */
function groupByDate(
  trades: readonly Trade[],
  timeZone: string,
): Map<string, Trade[]> {
  const out = new Map<string, Trade[]>();
  const add = (date: string, t: Trade) => {
    const list = out.get(date);
    if (!list) out.set(date, [t]);
    else if (list[list.length - 1] !== t) list.push(t);
  };
  for (const t of trades) {
    add(localDate(t.openedAt, timeZone), t);
    for (const r of realizations(t)) add(localDate(r.time, timeZone), t);
  }
  return out;
}

/** Each account's balance at the start of a date, worked out only when a percent cap asks. */
function balanceAtStart(
  accounts: readonly Account[],
  flows: readonly CashFlow[],
  trades: readonly Trade[],
  timeZone: string,
) {
  const memo = new Map<string, number>();
  return (date: string) =>
    (accountId: string): number => {
      const key = `${date}\u0000${accountId}`;
      let v = memo.get(key);
      if (v === undefined) {
        v = balanceAt(
          accounts.filter((a) => a.id === accountId),
          flows,
          trades,
          dayBefore(date),
          { timeZone },
        );
        memo.set(key, v);
      }
      return v;
    };
}

function hhmm(iso: string, timeZone: string): string {
  const p = localParts(iso, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/**
 * Every day from `startedOn` to today, scored. A finished day reads its lock
 * (K3); any other reads the day's trades with the version in effect that date.
 * `inputs` sums the selected accounts and `allInputs` every account (P6A-01).
 */
export function scoreHistory(
  tracker: Tracker,
  records: readonly DayRecord[],
  trades: readonly Trade[],
  accounts: readonly Account[],
  flows: readonly CashFlow[],
  env: RoutineEnv,
): ScoreHistory {
  const { timeZone, baseCurrency, today, accountIds } = env;
  const recordOf = new Map(records.map((r) => [r.id, r]));
  const byTradeDate = groupByDate(trades, timeZone);
  const startOf = balanceAtStart(accounts, flows, trades, timeZone);
  const nowTime = hhmm(env.now, timeZone);

  const scoreOne = (date: string): DayScore => {
    const record = recordOf.get(date);
    const locked = record?.locked;
    const version = locked?.version ?? versionOn(tracker, date);
    let perAccount: Record<string, AccountDayInputs> = {};
    if (locked) perAccount = locked.inputs;
    else if (version)
      perAccount = dayInputs(byTradeDate.get(date) ?? [], date, {
        timeZone,
        baseCurrency,
        version,
        balanceAtDayStart: startOf(date),
      });
    const stamp = locked ? locked.noteStartedAt : record?.noteStartedAt;
    const noteStartedAt = stampTime(stamp, date, timeZone);
    return scoreDay({
      date,
      today,
      nowTime,
      startedOn: tracker.startedOn,
      version,
      inputs: sumInputs(perAccount, accountIds),
      allInputs: sumInputs(perAccount),
      ticks: (locked ? locked.ticks : record?.ticks) ?? {},
      ...(noteStartedAt !== undefined ? { noteStartedAt } : {}),
      finished: locked !== undefined || record?.finishedAt !== undefined,
    });
  };

  const days: DayScore[] = [];
  const byDate = new Map<string, DayScore>();
  for (let d = tracker.startedOn; d <= today; d = dayAfter(d)) {
    const s = scoreOne(d);
    days.push(s);
    byDate.set(d, s);
  }
  return {
    tracker,
    today,
    days,
    byDate,
    scoreOn: (date) => byDate.get(date) ?? scoreOne(date),
  };
}

/** What finish stores (K3): the version in effect, every account's inputs, the ticks and the stamp. */
export function freezeDay(
  date: string,
  tracker: Tracker,
  record: DayRecord | undefined,
  trades: readonly Trade[],
  accounts: readonly Account[],
  flows: readonly CashFlow[],
  env: Omit<RoutineEnv, 'accountIds'>,
): FrozenDay {
  const version = versionOn(tracker, date) ?? tracker.versions[0]!;
  const touching = groupByDate(trades, env.timeZone).get(date) ?? [];
  const inputs = dayInputs(touching, date, {
    timeZone: env.timeZone,
    baseCurrency: env.baseCurrency,
    version,
    balanceAtDayStart: balanceAtStart(
      accounts,
      flows,
      trades,
      env.timeZone,
    )(date),
  });
  return {
    version,
    inputs,
    ticks: { ...record?.ticks },
    ...(record?.noteStartedAt !== undefined
      ? { noteStartedAt: record.noteStartedAt }
      : {}),
  };
}

/** The instant (ms) the local date ends, in the zone. */
const midnightAfter = (date: string, timeZone: string): number => {
  const [y, m, d] = dayAfter(date).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new TZDate(y, m - 1, d, 0, 0, 0, timeZone).getTime();
};

/** Milliseconds from `now` to the next local midnight in the zone. */
export function msToLocalMidnight(now: string, timeZone: string): number {
  return Math.max(
    0,
    midnightAfter(localDate(now, timeZone), timeZone) - Date.parse(now),
  );
}

/**
 * Session length in ms: end minus start. A running session on a date before the routine's `today` ends
 * at that date's local midnight (K30); one on today runs to `now`. Null if never started.
 */
export function sessionLength(
  s: DayRecord['session'],
  date: string,
  today: string,
  now: string,
  timeZone: string,
): number | null {
  if (!s) return null;
  const start = Date.parse(s.start);
  let end: number;
  if (s.end !== undefined) end = Date.parse(s.end);
  else if (date < today) {
    end = midnightAfter(date, timeZone);
  } else end = Date.parse(now);
  return Math.max(0, end - start);
}
