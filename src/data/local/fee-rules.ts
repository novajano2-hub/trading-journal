import { feeRuleError } from '@/domain/rules/fee-rules';
import type { FeeRule } from '@/domain/types';
import { NotFoundError, type FeeRulesRepo } from '../repository';
import { mergePatch } from '../merge';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { changeRows, fieldChanges, lifecycleRow, logHistory } from './history';
import { applyFeeRuleStored } from './rule-apply';
import { newestFirst, ruleLabel, tidySymbols } from './rule-shared';
import { rwTx } from './tx';

/** The rule fields history keeps (B26); the amounts are raw cents, formatted at read time. */
const LOGGED_FIELDS = [
  'accountId',
  'assetClass',
  'symbols',
  'mode',
  'applyOn',
  'commission',
  'fee',
] as const;

const tidy = (rule: FeeRule): FeeRule => ({
  ...rule,
  symbols: tidySymbols(rule.symbols),
});

function assertValid(rule: FeeRule): void {
  const problem = feeRuleError(rule);
  if (problem) throw new RangeError(problem);
}

async function accountOf(db: KeelDb, ws: string, id: string) {
  const account = await db.accounts.get([ws, id]);
  if (!account) throw new NotFoundError('account', id);
  return account;
}

export function localFeeRules(ctx: LocalContext): FeeRulesRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      return newestFirst(
        await db.feeRules.where('workspaceId').equals(ws).toArray(),
      );
    },

    async create(ws, input) {
      const db = await ctx.db();
      const rule = tidy({
        ...input,
        id: ctx.newId(),
        workspaceId: ws,
        createdAt: ctx.now().toISOString(),
      });
      assertValid(rule);
      return rwTx(db, [db.feeRules, db.accounts, db.history], async () => {
        const account = await accountOf(db, ws, rule.accountId);
        await db.feeRules.put(rule);
        await logHistory(
          db,
          ws,
          [
            lifecycleRow(
              'fee-rule',
              'created',
              rule.id,
              ruleLabel(account, rule),
            ),
          ],
          ctx,
        );
        return rule;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.feeRules, db.accounts, db.history], async () => {
        const stored = await db.feeRules.get([ws, id]);
        if (!stored) throw new NotFoundError('fee rule', id);
        const next = tidy({
          ...mergePatch(stored, patch),
          id,
          workspaceId: ws,
          createdAt: stored.createdAt,
        });
        assertValid(next);
        const account = await accountOf(db, ws, next.accountId);
        await db.feeRules.put(next);
        await logHistory(
          db,
          ws,
          changeRows(
            'fee-rule',
            id,
            ruleLabel(account, next),
            fieldChanges(stored, next, LOGGED_FIELDS),
          ),
          ctx,
        );
        return next;
      });
    },

    // Fees the rule has written stay (B57).
    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.feeRules, db.accounts, db.history], async () => {
        const rule = await db.feeRules.get([ws, id]);
        if (!rule) throw new NotFoundError('fee rule', id);
        const account = await db.accounts.get([ws, rule.accountId]);
        await db.feeRules.delete([ws, id]);
        await logHistory(
          db,
          ws,
          [lifecycleRow('fee-rule', 'deleted', id, ruleLabel(account, rule))],
          ctx,
        );
      });
    },

    async applyExisting(ws, id, override) {
      const db = await ctx.db();
      return rwTx(
        db,
        [db.feeRules, db.trades, db.accounts, db.history, db.meta],
        async () => {
          const rule = await db.feeRules.get([ws, id]);
          if (!rule) throw new NotFoundError('fee rule', id);
          return applyFeeRuleStored(db, ws, ctx, rule, override);
        },
      );
    },
  };
}
