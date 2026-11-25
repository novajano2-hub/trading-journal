import { realizations } from '@/domain/metrics/realized';
import { localDate } from '@/domain/time';
import { MON_TO_FRI, defaultVersion } from '@/domain/tracker/defaults';
import type {
  Account,
  CustomRule,
  DayRecord,
  JournalEntry,
  Tracker,
  Trade,
  TrackerVersion,
} from '@/domain/types';
import { freezeDay } from '../routine';
import { NY, nyIso, nyMs } from './calendar';
import { writeRoutineNotes } from './journal';
import type { Random } from './random';
import { SAMPLE_WORKSPACE } from '../workspaces';

const WS = SAMPLE_WORKSPACE.id;
const BASE = 'USD';
const MINUTE = 60_000;

/** One custom rule per stage, as comp 01 names them. */
const CUSTOM: readonly Pick<CustomRule, 'id' | 'name' | 'stage'>[] = [
  {
    id: 'sample-rule-levels',
    name: 'Mark key levels before the open',
    stage: 'prepare',
  },
  {
    id: 'sample-rule-quiet',
    name: 'No entries in the first 10 minutes',
    stage: 'trade',
  },
  {
    id: 'sample-rule-review',
    name: 'Review every losing trade',
    stage: 'reflect',
  },
];

/** The value at fraction `p` of the sorted values; 0 with none. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

const roundUp = (cents: number, to: number): number =>
  Math.ceil(cents / to) * to;

/**
 * The sample's tracker and the day records behind it (K23). Records go on the
 * dates that have a daily note; every one before `endDate` is finished.
 *
 * The rules keep TradeZella's on/off set and hours window (R7): start by 09:30,
 * strategy, stop and both caps on, trading hours off. Only the two cap amounts
 * are sized to the sample, near the 95th percentile of its trade losses and
 * the 85th of its daily losses, raised to cover the days below, so some days
 * break them. A day whose trades all carry a strategy and a stop can be
 * perfect, so those days get an early note and every tick, and their trades
 * are kept within the caps. No rule is turned on or off to make a state.
 */
export function writeRoutine(
  rng: Random,
  s: {
    trades: Trade[];
    journal: JournalEntry[];
    accounts: Account[];
    startedOn: string;
    endDate: string;
  },
): { tracker: Tracker; days: DayRecord[]; notes: JournalEntry[] } {
  const { trades, startedOn, endDate } = s;
  const noteDays = s.journal
    .filter((e) => e.kind === 'daily-review' && e.date !== undefined)
    .map((e) => e.date!)
    .sort();

  // The noted days before endDate on which every trade has a strategy and a stop.
  const unplanned = new Set<string>();
  for (const t of trades)
    if (t.strategyIds.length === 0 || t.plannedStop === undefined)
      unplanned.add(localDate(t.openedAt, NY));
  const traded = new Set(trades.map((t) => localDate(t.openedAt, NY)));
  const keep = new Set(
    [...traded].filter((d) => d < endDate && !unplanned.has(d)),
  );
  // Noted days get a record, and so do the keep days: with the sample's trades
  // left as they are, those are the only days that can be perfect.
  // A stamp needs a note on its date, so the keep days that have none get one.
  const noted = new Set(noteDays);
  const notes = writeRoutineNotes(
    rng,
    trades,
    [...keep].filter((d) => !noted.has(d)).sort(),
  );
  const recordDays = [...new Set([...noteDays, ...keep])].sort();

  // What the sample loses, per trade and per day, and what the keep days need.
  const dayLoss = new Map<string, number>();
  const tradeLosses: number[] = [];
  for (const t of trades) {
    if (t.pnlCurrency !== BASE) continue;
    if (t.status === 'closed' && t.net < 0) tradeLosses.push(-t.net);
    for (const r of realizations(t)) {
      const d = localDate(r.time, NY);
      dayLoss.set(d, (dayLoss.get(d) ?? 0) + r.net);
    }
  }
  const dayLosses = [...dayLoss.values()].filter((n) => n < 0).map((n) => -n);
  let perTrade = percentile(tradeLosses, 0.95);
  let perDay = percentile(dayLosses, 0.85);
  for (const d of keep) perDay = Math.max(perDay, -(dayLoss.get(d) ?? 0));
  for (const t of trades)
    if (
      keep.has(localDate(t.openedAt, NY)) &&
      t.pnlCurrency === BASE &&
      t.net < 0
    )
      perTrade = Math.max(perTrade, -t.net);

  const base = defaultVersion(startedOn);
  const version: TrackerVersion = {
    ...base,
    builtIn: {
      ...base.builtIn,
      hours: { on: false, from: '09:00', to: '12:00' },
      lossPerTrade: {
        on: true,
        unit: 'amount',
        value: roundUp(perTrade, 5_000),
      },
      lossPerDay: { on: true, amount: roundUp(perDay, 5_000) },
    },
    custom: CUSTOM.map((c) => ({
      ...c,
      days: [...MON_TO_FRI] as CustomRule['days'],
    })),
  };
  const tracker: Tracker = {
    id: 'tracker',
    workspaceId: WS,
    startedOn,
    versions: [version],
    asOf: endDate,
  };

  const recordSet = new Set(recordDays);
  const opened = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = localDate(t.openedAt, NY);
    if (recordSet.has(d)) opened.set(d, [...(opened.get(d) ?? []), t]);
  }

  const days: DayRecord[] = recordDays.map((date) => {
    // Every draw is made whatever the day, so one day's choices never move another's.
    const early = rng.chance(0.8);
    const minute = rng.int(0, 89);
    const lateMinute = rng.int(5, 150);
    const tickDraws = CUSTOM.map(() => rng.chance(0.85));
    const moodDraw = rng.chance(0.5);
    const moodValue = rng.int(1, 5) as 1 | 2 | 3 | 4 | 5;
    const ratingDraw = rng.chance(0.33);
    const ratingValue = rng.int(1, 5) as 1 | 2 | 3 | 4 | 5;
    const finishMinute = rng.int(0, 29);

    const sure = keep.has(date);
    const stamp =
      early || sure
        ? nyMs(date, 8, minute)
        : nyMs(date, 9, 30) + lateMinute * MINUTE;
    const times = (opened.get(date) ?? []).flatMap((t) =>
      t.executions
        .filter((e) => localDate(e.time, NY) === date)
        .map((e) => Date.parse(e.time)),
    );
    const record: DayRecord = {
      id: date,
      workspaceId: WS,
      noteStartedAt: new Date(stamp).toISOString(),
      ticks: Object.fromEntries(
        CUSTOM.map((c, i) => [c.id, keep.has(date) || tickDraws[i]!]),
      ),
      ...(times.length > 0
        ? {
            session: {
              start: new Date(Math.min(...times) - 10 * MINUTE).toISOString(),
              end: new Date(Math.max(...times) + 5 * MINUTE).toISOString(),
            },
          }
        : {}),
      ...(moodDraw ? { mood: { value: moodValue } } : {}),
      ...(ratingDraw ? { rating: ratingValue } : {}),
    };
    if (date === endDate) return record;
    const finishedAt = nyIso(date, 17, finishMinute);
    const finished: DayRecord = { ...record, finishedAt };
    finished.locked = freezeDay(
      date,
      tracker,
      finished,
      trades,
      s.accounts,
      [],
      {
        timeZone: NY,
        baseCurrency: BASE,
        now: finishedAt,
        today: endDate,
      },
    );
    return finished;
  });
  return { tracker, days, notes };
}
