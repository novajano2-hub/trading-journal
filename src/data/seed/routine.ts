import { realizations } from '@/domain/metrics/realized';
import { localDate, localParts } from '@/domain/time';
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

const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** The value at fraction `p` of the sorted values; 0 with none. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

const roundUp = (cents: number, to: number): number =>
  Math.ceil(cents / to) * to;

function minuteOf(iso: string): number {
  const p = localParts(iso, NY);
  return p.hour * 60 + p.minute;
}

/**
 * The sample's tracker and the day records behind it (K23). Records go on the
 * dates that have a daily note; every one before `endDate` is finished.
 *
 * Rule values are sized to the sample so every state shows, whatever the end
 * date: the caps sit near the 95th and 85th percentile of the sample's own
 * losses, so some days break them, and the hours window and caps are stretched
 * to cover the two days before `endDate`, which are also given an early note
 * and every tick. That makes a streak of two. Strategy and stop are off,
 * because the sample leaves some trades without either and no cap could cover
 * that; My workspace keeps TradeZella's defaults.
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
): { tracker: Tracker; days: DayRecord[] } {
  const { trades, startedOn, endDate } = s;
  const noteDays = s.journal
    .filter((e) => e.kind === 'daily-review' && e.date !== undefined)
    .map((e) => e.date!)
    .sort();
  const keep = new Set(noteDays.filter((d) => d < endDate).slice(-2));

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
  let from = 9 * 60;
  let to = 12 * 60;
  for (const d of keep) perDay = Math.max(perDay, -(dayLoss.get(d) ?? 0));
  for (const t of trades) {
    if (!keep.has(localDate(t.openedAt, NY))) continue;
    if (t.pnlCurrency === BASE && t.net < 0)
      perTrade = Math.max(perTrade, -t.net);
    from = Math.min(from, minuteOf(t.openedAt));
    const last = t.closedAt ?? t.executions[t.executions.length - 1]?.time;
    if (last && localDate(last, NY) === localDate(t.openedAt, NY))
      to = Math.max(to, minuteOf(last));
  }

  const base = defaultVersion(startedOn);
  const version: TrackerVersion = {
    ...base,
    builtIn: {
      startBy: { on: true, time: '09:30' },
      hours: {
        on: true,
        from: hhmm(Math.floor(from / 60) * 60),
        to: hhmm(Math.ceil((to + 1) / 60) * 60),
      },
      strategy: { on: false },
      stop: { on: false },
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

  const opened = new Map<string, Trade[]>();
  for (const t of trades) {
    const d = localDate(t.openedAt, NY);
    if (noteDays.includes(d)) opened.set(d, [...(opened.get(d) ?? []), t]);
  }

  const days: DayRecord[] = noteDays.map((date) => {
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

    const sure = keep.has(date) || date === endDate;
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
  return { tracker, days };
}
