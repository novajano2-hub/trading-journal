import type { CashFlow } from '@/domain/types';
import {
  NotFoundError,
  type CashFlowsRepo,
  type NewCashFlow,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';

/** A real calendar date, YYYY-MM-DD. */
function isDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Throws RangeError for a date, amount or account the flow can't have. */
async function assertValid(db: KeelDb, f: CashFlow): Promise<void> {
  if (!isDate(f.date))
    throw new RangeError(
      `A cash flow's date must be YYYY-MM-DD, got "${f.date}"`,
    );
  if (!Number.isInteger(f.amount) || f.amount === 0)
    throw new RangeError('A cash flow is a nonzero whole number of cents');
  if (!(await db.accounts.get([f.workspaceId, f.accountId])))
    throw new NotFoundError('account', f.accountId);
}

/** The flow with a trimmed note; an empty note is left out. */
function tidy(f: CashFlow): CashFlow {
  const { note, ...rest } = f;
  const trimmed = note?.trim();
  return trimmed ? { ...rest, note: trimmed } : rest;
}

export function localCashFlows(ctx: LocalContext): CashFlowsRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.cashflows.where('workspaceId').equals(ws).toArray();
      return rows.sort(
        (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
      );
    },

    async create(ws, input: NewCashFlow) {
      const db = await ctx.db();
      const flow = tidy({ ...input, id: ctx.newId(), workspaceId: ws });
      return rwTx(db, [db.cashflows, db.accounts], async () => {
        await assertValid(db, flow);
        await db.cashflows.put(flow);
        return flow;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.cashflows, db.accounts], async () => {
        const flow = await db.cashflows.get([ws, id]);
        if (!flow) throw new NotFoundError('cash flow', id);
        const next = tidy({
          ...flow,
          ...(patch.accountId !== undefined && { accountId: patch.accountId }),
          ...(patch.date !== undefined && { date: patch.date }),
          ...(patch.amount !== undefined && { amount: patch.amount }),
          ...(patch.note !== undefined && { note: patch.note }),
        });
        await assertValid(db, next);
        await db.cashflows.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.cashflows], async () => {
        if (!(await db.cashflows.get([ws, id])))
          throw new NotFoundError('cash flow', id);
        await db.cashflows.delete([ws, id]);
      });
    },
  };
}
