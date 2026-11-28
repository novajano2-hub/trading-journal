import type { Account, CashFlow } from '@/domain/types';
import {
  NotFoundError,
  type CashFlowsRepo,
  type NewCashFlow,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { changeRows, fieldChanges, lifecycleRow, logHistory } from './history';
import { rwTx } from './tx';

/** A real calendar date, YYYY-MM-DD. */
function isDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** Throws RangeError for a date, amount or account the flow can't have; returns the account. */
async function assertValid(db: KeelDb, f: CashFlow): Promise<Account> {
  if (!isDate(f.date))
    throw new RangeError(
      `A cash flow's date must be YYYY-MM-DD, got "${f.date}"`,
    );
  if (!Number.isInteger(f.amount) || f.amount === 0)
    throw new RangeError('A cash flow is a nonzero whole number of cents');
  const account = await db.accounts.get([f.workspaceId, f.accountId]);
  if (!account) throw new NotFoundError('account', f.accountId);
  return account;
}

/** The flow with a trimmed note; an empty note is left out. */
function tidy(f: CashFlow): CashFlow {
  const { note, ...rest } = f;
  const trimmed = note?.trim();
  return trimmed ? { ...rest, note: trimmed } : rest;
}

/**
 * The cash flow fields history keeps (B26). `at` is the flow's date and `kind`
 * is read off the sign of the amount, as the form shows it.
 */
function loggedView(f: CashFlow) {
  return {
    amount: f.amount,
    kind: f.amount < 0 ? 'withdrawal' : 'deposit',
    at: f.date,
    note: f.note,
    accountId: f.accountId,
  };
}

/** How history names a flow: its account and its date. */
const labelOf = (account: Account | undefined, f: CashFlow) =>
  `${account?.name ?? f.accountId} ${f.date}`;

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
      return rwTx(db, [db.cashflows, db.accounts, db.history], async () => {
        const account = await assertValid(db, flow);
        await db.cashflows.put(flow);
        await logHistory(
          db,
          ws,
          [
            lifecycleRow(
              'cash-flow',
              'created',
              flow.id,
              labelOf(account, flow),
            ),
          ],
          ctx,
        );
        return flow;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.cashflows, db.accounts, db.history], async () => {
        const flow = await db.cashflows.get([ws, id]);
        if (!flow) throw new NotFoundError('cash flow', id);
        const next = tidy({
          ...flow,
          ...(patch.accountId !== undefined && { accountId: patch.accountId }),
          ...(patch.date !== undefined && { date: patch.date }),
          ...(patch.amount !== undefined && { amount: patch.amount }),
          ...(patch.note !== undefined && { note: patch.note }),
        });
        const account = await assertValid(db, next);
        await db.cashflows.put(next);
        await logHistory(
          db,
          ws,
          changeRows(
            'cash-flow',
            id,
            labelOf(account, next),
            fieldChanges(loggedView(flow), loggedView(next), [
              'amount',
              'kind',
              'at',
              'note',
              'accountId',
            ]),
          ),
          ctx,
        );
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.cashflows, db.accounts, db.history], async () => {
        const flow = await db.cashflows.get([ws, id]);
        if (!flow) throw new NotFoundError('cash flow', id);
        await db.cashflows.delete([ws, id]);
        const account = await db.accounts.get([ws, flow.accountId]);
        await logHistory(
          db,
          ws,
          [lifecycleRow('cash-flow', 'deleted', id, labelOf(account, flow))],
          ctx,
        );
      });
    },
  };
}
