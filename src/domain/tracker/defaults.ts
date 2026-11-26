import { TZDate } from '@date-fns/tz';
import { localDate } from '../time';
import type { Tracker, TrackerVersion, Weekdays } from '../types';

/** Sunday first, as Date#getDay. */
export const MON_TO_FRI: Weekdays = [
  false,
  true,
  true,
  true,
  true,
  true,
  false,
];

/** TradeZella's defaults: startBy on 09:30; hours off 09:00 to 12:00; strategy on; stop on;
 *  lossPerTrade on, amount 10_000; lossPerDay on, 10_000; no custom rules; Mo to Fr. */
export function defaultVersion(from: string): TrackerVersion {
  return {
    from,
    tradingDays: [...MON_TO_FRI] as Weekdays,
    builtIn: {
      startBy: { on: true, time: '09:30' },
      hours: { on: false, from: '09:00', to: '12:00' },
      strategy: { on: true },
      stop: { on: true },
      lossPerTrade: { on: true, unit: 'amount', value: 10_000 },
      lossPerDay: { on: true, amount: 10_000 },
    },
    custom: [],
  };
}

/** The newest version with from <= date; undefined before startedOn. */
export function versionOn(
  t: Pick<Tracker, 'startedOn' | 'versions'>,
  date: string,
): TrackerVersion | undefined {
  if (date < t.startedOn) return undefined;
  for (let i = t.versions.length - 1; i >= 0; i--) {
    const v = t.versions[i]!;
    if (v.from <= date) return v;
  }
  return undefined;
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** K23: the sample's asOf when set, else localDate(nowIso, timeZone). */
export function routineToday(
  tracker: Pick<Tracker, 'asOf'>,
  nowIso: string,
  timeZone: string,
): string {
  return tracker.asOf ?? localDate(nowIso, timeZone);
}

/**
 * The routine's "now" as an instant: the real one, or, when the sample has an
 * `asOf` date, that date at the current wall-clock time in the zone. The
 * sample's today is always behind the real date, so a stamp, a session or a
 * clock reading taken on it must sit on it, not on the real day.
 */
export function routineNow(
  tracker: Pick<Tracker, 'asOf'>,
  nowIso: string,
  timeZone: string,
): string {
  if (tracker.asOf === undefined) return nowIso;
  const [y, m, d] = tracker.asOf.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const at = new TZDate(Date.parse(nowIso), timeZone);
  const onAsOf = new TZDate(
    y,
    m - 1,
    d,
    at.getHours(),
    at.getMinutes(),
    at.getSeconds(),
    at.getMilliseconds(),
    timeZone,
  );
  return new Date(onAsOf.getTime()).toISOString();
}
