import type { PropTxn, PropTxnCategory, PropTxnStatus } from '@/domain/types';
import { mergePatch } from '../merge';
import {
  NotFoundError,
  type NewPropTxn,
  type PropTxnsRepo,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';

const CATEGORIES: readonly PropTxnCategory[] = [
  'payout',
  'evaluation-fee',
  'activation-fee',
  'reset-fee',
  'affiliate-income',
  'uncategorized',
];
const STATUSES: readonly PropTxnStatus[] = [
  'not-reviewed',
  'reviewed',
  'ignored',
];

/** A real calendar date, YYYY-MM-DD. */
function isDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Throws RangeError for a row that can't be, NotFoundError for a challenge that isn't there. */
async function assertValid(db: KeelDb, t: PropTxn): Promise<void> {
  if (!isDate(t.date))
    throw new RangeError(
      `A transaction's date must be YYYY-MM-DD, got "${t.date}"`,
    );
  if (!Number.isInteger(t.amount) || t.amount === 0)
    throw new RangeError('A transaction is a nonzero whole number of cents');
  if (!CATEGORIES.includes(t.category))
    throw new RangeError(`Unknown transaction category "${t.category}"`);
  if (!STATUSES.includes(t.status))
    throw new RangeError(`Unknown transaction status "${t.status}"`);
  if (
    t.challengeId !== undefined &&
    !(await db.challenges.get([t.workspaceId, t.challengeId]))
  )
    throw new NotFoundError('challenge', t.challengeId);
}

/** The row with trimmed text; an empty description is left out. */
function tidy(t: PropTxn): PropTxn {
  const { description, ...rest } = t;
  const text = description?.trim();
  return {
    ...rest,
    firm: t.firm.trim(),
    ...(text ? { description: text } : {}),
  };
}

export function localPropTxns(ctx: LocalContext): PropTxnsRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.propTxns.where('workspaceId').equals(ws).toArray();
      return rows.sort(
        (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
      );
    },

    async add(ws, input: NewPropTxn) {
      const db = await ctx.db();
      const row = tidy({ ...input, id: ctx.newId(), workspaceId: ws });
      return rwTx(db, [db.propTxns, db.challenges], async () => {
        await assertValid(db, row);
        await db.propTxns.put(row);
        return row;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.propTxns, db.challenges], async () => {
        const current = await db.propTxns.get([ws, id]);
        if (!current) throw new NotFoundError('transaction', id);
        const next = tidy({
          ...mergePatch(current, patch, ['description', 'challengeId']),
          id,
          workspaceId: ws,
        });
        await assertValid(db, next);
        await db.propTxns.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.propTxns], async () => {
        if (!(await db.propTxns.get([ws, id])))
          throw new NotFoundError('transaction', id);
        await db.propTxns.delete([ws, id]);
      });
    },
  };
}
