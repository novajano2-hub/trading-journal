import { targetRuleError } from '@/domain/rules/target-rules';
import type { TargetRule } from '@/domain/types';
import { NotFoundError, type TargetRulesRepo } from '../repository';
import { mergePatch } from '../merge';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { changeRows, fieldChanges, lifecycleRow, logHistory } from './history';
import { applyTargetRuleStored } from './rule-apply';
import { newestFirst, ruleLabel, tidySymbols } from './rule-shared';
import { rwTx } from './tx';

/** The rule fields history keeps (B26). */
const LOGGED_FIELDS = [
  'accountId',
  'assetClass',
  'symbols',
  'target',
  'stop',
] as const;

type Side = NonNullable<TargetRule['target']>;

/** A side in the one shape it is stored and compared in, so an edit that changes nothing logs nothing. */
const tidySide = (side: Side): Side => ({
  unit: side.unit,
  levels: side.levels.map(({ value, pct }) => ({ value, pct })),
});

/** The rule as it is stored: tidy symbols and sides in one shape. */
function tidy(rule: TargetRule): TargetRule {
  const { target, stop, ...rest } = rule;
  return {
    ...rest,
    symbols: tidySymbols(rule.symbols),
    ...(target ? { target: tidySide(target) } : {}),
    ...(stop ? { stop: tidySide(stop) } : {}),
  };
}

function assertValid(rule: TargetRule): void {
  const problem = targetRuleError(rule);
  if (problem) throw new RangeError(problem);
}

async function accountOf(db: KeelDb, ws: string, id: string) {
  const account = await db.accounts.get([ws, id]);
  if (!account) throw new NotFoundError('account', id);
  return account;
}

export function localTargetRules(ctx: LocalContext): TargetRulesRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      return newestFirst(
        await db.targetRules.where('workspaceId').equals(ws).toArray(),
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
      return rwTx(db, [db.targetRules, db.accounts, db.history], async () => {
        const account = await accountOf(db, ws, rule.accountId);
        await db.targetRules.put(rule);
        await logHistory(
          db,
          ws,
          [
            lifecycleRow(
              'target-rule',
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
      return rwTx(db, [db.targetRules, db.accounts, db.history], async () => {
        const stored = await db.targetRules.get([ws, id]);
        if (!stored) throw new NotFoundError('target rule', id);
        const next = tidy({
          ...mergePatch(stored, patch, ['target', 'stop']),
          id,
          workspaceId: ws,
          createdAt: stored.createdAt,
        });
        assertValid(next);
        const account = await accountOf(db, ws, next.accountId);
        await db.targetRules.put(next);
        await logHistory(
          db,
          ws,
          changeRows(
            'target-rule',
            id,
            ruleLabel(account, next),
            fieldChanges(stored, next, LOGGED_FIELDS),
          ),
          ctx,
        );
        return next;
      });
    },

    // What the rule has written on trades stays (B57).
    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.targetRules, db.accounts, db.history], async () => {
        const rule = await db.targetRules.get([ws, id]);
        if (!rule) throw new NotFoundError('target rule', id);
        const account = await db.accounts.get([ws, rule.accountId]);
        await db.targetRules.delete([ws, id]);
        await logHistory(
          db,
          ws,
          [
            lifecycleRow(
              'target-rule',
              'deleted',
              id,
              ruleLabel(account, rule),
            ),
          ],
          ctx,
        );
      });
    },

    async applyExisting(ws, id, override) {
      const db = await ctx.db();
      return rwTx(
        db,
        [db.targetRules, db.trades, db.accounts, db.history, db.meta],
        async () => {
          const rule = await db.targetRules.get([ws, id]);
          if (!rule) throw new NotFoundError('target rule', id);
          return applyTargetRuleStored(db, ws, ctx, rule, override);
        },
      );
    },
  };
}
