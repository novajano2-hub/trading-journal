import { versionOn, weekdayOf } from '@/domain/tracker/defaults';
import type { DayRecord } from '@/domain/types';
import { LockedDayError, type DaysRepo } from '../repository';
import type { LocalContext } from './context';
import { isLocked, routineNowIn, todayIn } from './routine-today';
import { ensureTracker } from './tracker';
import { rwTx } from './tx';

export function localDays(ctx: LocalContext): DaysRepo {
  /** Edits the date's record in one transaction, refusing a finished day. */
  async function edit(
    ws: string,
    date: string,
    change: (
      day: DayRecord,
      today: string,
      now: string,
    ) => DayRecord | Promise<DayRecord>,
  ): Promise<DayRecord> {
    const db = await ctx.db();
    return rwTx(db, [db.days, db.trackers, db.meta], async () => {
      if (await isLocked(db, ws, date)) throw new LockedDayError();
      const today = await todayIn(db, ws, ctx.now());
      const day = (await db.days.get([ws, date])) ?? {
        id: date,
        workspaceId: ws,
      };
      const next = await change(
        day,
        today,
        await routineNowIn(db, ws, ctx.now()),
      );
      await db.days.put(next);
      return next;
    });
  }

  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.days.where('workspaceId').equals(ws).toArray();
      return rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },

    startSession: (ws, date) =>
      edit(ws, date, (day, today, now) => {
        if (date !== today)
          throw new RangeError('A session can start on today only');
        if (day.session !== undefined)
          throw new RangeError('The day has had its session');
        return { ...day, session: { start: now } };
      }),

    endSession: (ws, date) =>
      edit(ws, date, (day, _today, now) => {
        if (day.session === undefined || day.session.end !== undefined)
          throw new RangeError('The day has no running session');
        return {
          ...day,
          session: { ...day.session, end: now },
        };
      }),

    setTick: (ws, date, ruleId, ticked) =>
      edit(ws, date, (day) => ({
        ...day,
        ticks: { ...day.ticks, [ruleId]: ticked },
      })),

    setRating: (ws, date, rating) =>
      edit(ws, date, (day) => {
        const next = { ...day, rating };
        if (rating === undefined) delete next.rating;
        return next;
      }),

    setMood: (ws, date, mood) =>
      edit(ws, date, (day) => {
        const next = { ...day, mood };
        if (mood === undefined) delete next.mood;
        return next;
      }),

    async finish(ws, date, frozen) {
      const db = await ctx.db();
      return rwTx(db, [db.days, db.trackers, db.meta], async () => {
        if (await isLocked(db, ws, date)) throw new LockedDayError();
        const today = await todayIn(db, ws, ctx.now());
        const tracker = await ensureTracker(db, ws, ctx.now());
        if (date > today) throw new RangeError('The day has not come yet');
        const version = versionOn(tracker, date);
        if (version === undefined)
          throw new RangeError('The day is before the tracker started');
        if (!version.tradingDays[weekdayOf(date)])
          throw new RangeError('The day is not a trading day');
        const day = (await db.days.get([ws, date])) ?? {
          id: date,
          workspaceId: ws,
        };
        const nowIso = ctx.now().toISOString();
        const session =
          day.session !== undefined && day.session.end === undefined
            ? { ...day.session, end: nowIso }
            : day.session;
        const next: DayRecord = {
          ...day,
          ...(session !== undefined ? { session } : {}),
          finishedAt: nowIso,
          locked: frozen,
        };
        await db.days.put(next);
        return next;
      });
    },
  };
}
