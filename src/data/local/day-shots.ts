import type { DayShot } from '@/domain/types';
import {
  LockedDayError,
  NotFoundError,
  SHOT_MAX_BYTES,
  ShotRejected,
  type DayShotsRepo,
} from '../repository';
import type { LocalContext } from './context';
import { isLocked } from './routine-today';
import { rwTx } from './tx';

const TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg']);

/** Dexie wraps the browser's error and keeps the original in `inner`. */
export function isQuota(error: unknown): boolean {
  const e = error as { name?: string; inner?: unknown } | null;
  return (
    e?.name === 'QuotaExceededError' ||
    (e?.inner as { name?: string } | undefined)?.name === 'QuotaExceededError'
  );
}

export function localDayShots(ctx: LocalContext): DayShotsRepo {
  return {
    async list(ws, date) {
      const db = await ctx.db();
      const rows = await db.dayShots
        .where('[workspaceId+date]')
        .equals([ws, date])
        .toArray();
      return rows.sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      );
    },

    async add(ws, date, file) {
      if (!TYPES.has(file.type)) throw new ShotRejected('type');
      if (file.bytes.byteLength > SHOT_MAX_BYTES)
        throw new ShotRejected('size');
      const db = await ctx.db();
      try {
        return await rwTx(db, [db.dayShots, db.days], async () => {
          if (await isLocked(db, ws, date)) throw new LockedDayError();
          const existing = await db.dayShots
            .where('[workspaceId+date]')
            .equals([ws, date])
            .toArray();
          // Upload order is the creation order, so a clock tie moves on a millisecond.
          const last = existing.reduce(
            (m, s) => (s.createdAt > m ? s.createdAt : m),
            '',
          );
          let at = ctx.now().getTime();
          if (last !== '' && at <= Date.parse(last)) at = Date.parse(last) + 1;
          const shot: DayShot = {
            id: ctx.newId(),
            workspaceId: ws,
            date,
            bytes: file.bytes,
            type: file.type as DayShot['type'],
            name: file.name,
            size: file.bytes.byteLength,
            createdAt: new Date(at).toISOString(),
          };
          await db.dayShots.put(shot);
          return shot;
        });
      } catch (error) {
        if (isQuota(error)) throw new ShotRejected('quota');
        throw error;
      }
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.dayShots, db.days], async () => {
        const shot = await db.dayShots.get([ws, id]);
        if (!shot) throw new NotFoundError('screenshot', id);
        if (await isLocked(db, ws, shot.date)) throw new LockedDayError();
        await db.dayShots.delete([ws, id]);
      });
    },
  };
}
