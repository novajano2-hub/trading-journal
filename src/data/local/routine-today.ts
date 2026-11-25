import { routineToday } from '@/domain/tracker/defaults';
import type { KeelDb } from './db';
import { readPrefs } from './prefs';

/**
 * The routine's today (K23): the sample's `asOf` when the workspace's tracker
 * has one, else the local date in the profile zone. Call inside a transaction
 * that includes `db.trackers` and `db.meta`.
 */
export async function todayIn(
  db: KeelDb,
  ws: string,
  now: Date,
): Promise<string> {
  const tracker = await db.trackers.get([ws, 'tracker']);
  const { timeZone } = await readPrefs(db);
  return routineToday(tracker ?? {}, now.toISOString(), timeZone);
}

/** True when the date's day record is finished. Call inside a transaction that includes `db.days`. */
export async function isLocked(
  db: KeelDb,
  ws: string,
  date: string,
): Promise<boolean> {
  const day = await db.days.get([ws, date]);
  return day?.locked !== undefined || day?.finishedAt !== undefined;
}
