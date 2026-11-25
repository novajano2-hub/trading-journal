import { defaultVersion } from '@/domain/tracker/defaults';
import type { Tracker } from '@/domain/types';
import type { TrackerRepo } from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { isLockedDay, todayIn } from './routine-today';
import { rwTx } from './tx';

/** The workspace's tracker, made on first read. Call inside an rw transaction over `trackers` and `meta`. */
export async function ensureTracker(
  db: KeelDb,
  ws: string,
  now: Date,
): Promise<Tracker> {
  const existing = await db.trackers.get([ws, 'tracker']);
  if (existing) return existing;
  const today = await todayIn(db, ws, now);
  const tracker: Tracker = {
    id: 'tracker',
    workspaceId: ws,
    startedOn: today,
    versions: [defaultVersion(today)],
  };
  await db.trackers.put(tracker);
  return tracker;
}

export function localTracker(ctx: LocalContext): TrackerRepo {
  return {
    async get(ws) {
      const db = await ctx.db();
      return rwTx(db, [db.trackers, db.meta], async () =>
        ensureTracker(db, ws, ctx.now()),
      );
    },

    async save(ws, rules) {
      const db = await ctx.db();
      return rwTx(db, [db.trackers, db.meta], async () => {
        const tracker = await ensureTracker(db, ws, ctx.now());
        const today = await todayIn(db, ws, ctx.now());
        const version = { ...rules, from: today };
        const last = tracker.versions[tracker.versions.length - 1];
        const versions =
          last !== undefined && last.from >= today
            ? [...tracker.versions.slice(0, -1), version]
            : [...tracker.versions, version];
        const next = { ...tracker, versions };
        await db.trackers.put(next);
        return next;
      });
    },

    async reset(ws) {
      const db = await ctx.db();
      return rwTx(db, [db.trackers, db.days, db.meta], async () => {
        const tracker = await ensureTracker(db, ws, ctx.now());
        const today = await todayIn(db, ws, ctx.now());
        const next: Tracker = {
          ...tracker,
          startedOn: today,
          versions: [defaultVersion(today)],
        };
        await db.trackers.put(next);
        // Finished days stay locked (P6A-04); the rest lose their ticks.
        const open = await db.days
          .where('workspaceId')
          .equals(ws)
          .filter((d) => !isLockedDay(d) && d.ticks !== undefined)
          .toArray();
        for (const day of open) {
          const next = { ...day };
          delete next.ticks;
          await db.days.put(next);
        }
        return next;
      });
    },
  };
}
