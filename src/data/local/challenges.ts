import type { BreachReason, Challenge } from '@/domain/types';
import { mergePatch } from '../merge';
import {
  ChallengeBreachedError,
  NotFoundError,
  type ChallengesRepo,
  type NewChallenge,
  type NewChallengeAccount,
  type NewChallengeEntry,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';

const isDate = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
};

const REASONS: readonly BreachReason[] = [
  'max-drawdown',
  'overtrading',
  'time-pressure',
  'risk-management',
  'other',
];

const isFee = (n: number | undefined): boolean =>
  n === undefined || (Number.isInteger(n) && n >= 0);

/** Throws RangeError for a challenge that can't be, NotFoundError for an account that isn't there. */
async function assertValid(db: KeelDb, c: Challenge): Promise<void> {
  if (c.name.trim() === '') throw new RangeError('A challenge needs a name');
  if (c.firm.trim() === '') throw new RangeError('A challenge needs a firm');
  const steps =
    c.steps === 1 ? ['step-1', 'funded'] : ['step-1', 'step-2', 'funded'];
  if (
    (c.steps !== 1 && c.steps !== 2) ||
    c.phases.map((p) => p.step).join() !== steps.join()
  )
    throw new RangeError(
      `A ${c.steps}-step challenge has the phases ${steps.join(', ')}`,
    );
  if (!isFee(c.evaluationFee) || !isFee(c.activationFee))
    throw new RangeError('A fee is a whole number of cents, 0 or more');
  if (c.movedToFundedOn !== undefined && !isDate(c.movedToFundedOn))
    throw new RangeError(
      `A move-to-funded date must be YYYY-MM-DD, got "${c.movedToFundedOn}"`,
    );
  for (const id of c.strategyIds ?? [])
    if (!(await db.strategies.get([c.workspaceId, id])))
      throw new NotFoundError('strategy', id);
  const linked = new Set<string>();
  // The rules live on the account, so another challenge's account can't be shared.
  const others = (
    await db.challenges.where('workspaceId').equals(c.workspaceId).toArray()
  ).filter((o) => o.id !== c.id);
  for (const p of c.phases) {
    if (p.startDate !== undefined && !isDate(p.startDate))
      throw new RangeError(
        `A start date must be YYYY-MM-DD, got "${p.startDate}"`,
      );
    if (p.accountId === undefined) continue;
    if (linked.has(p.accountId))
      throw new RangeError('One account can be linked to one phase only');
    linked.add(p.accountId);
    const owner = others.find((o) =>
      o.phases.some((q) => q.accountId === p.accountId),
    );
    if (owner)
      throw new RangeError(
        `That account is already linked by the challenge "${owner.name}"`,
      );
    if (!(await db.accounts.get([c.workspaceId, p.accountId])))
      throw new NotFoundError('account', p.accountId);
  }
}

/** The challenge with its text trimmed, an empty failure reason left out and each strategy listed once. */
function tidy(c: Challenge): Challenge {
  const { failureReason, strategyIds, ...rest } = c;
  const reason = failureReason?.trim();
  return {
    ...rest,
    name: c.name.trim(),
    firm: c.firm.trim(),
    ...(reason ? { failureReason: reason } : {}),
    ...(strategyIds ? { strategyIds: [...new Set(strategyIds)] } : {}),
  };
}

const BREACH_THROUGH_MARK =
  'A challenge is breached through markBreached, which records the reason and the date';

/** Throws RangeError for a breach date or reason that can't be, as markBreached does. */
function assertBreach(breach: { reason: BreachReason; on: string }): void {
  if (!isDate(breach.on))
    throw new RangeError(
      `A breach date must be YYYY-MM-DD, got "${breach.on}"`,
    );
  if (!REASONS.includes(breach.reason))
    throw new RangeError(`Unknown breach reason "${breach.reason}"`);
}

/** `phases` with each new account created and linked to its phase; RangeError for a phase that isn't there or has an account. */
async function linkNewAccounts(
  ctx: LocalContext,
  db: KeelDb,
  ws: string,
  base: Challenge['phases'],
  list: readonly NewChallengeAccount[],
): Promise<Challenge['phases']> {
  const phases = base.map((p) => ({ ...p }));
  for (const { step, account } of list) {
    const phase = phases.find((p) => p.step === step);
    if (!phase)
      throw new RangeError(`The challenge has no ${step} phase to link to`);
    if (phase.accountId !== undefined)
      throw new RangeError(`The ${step} phase is linked to an account`);
    const row = { ...account, id: ctx.newId(), workspaceId: ws };
    // FIFO is the unset method.
    if (row.costMethod === 'fifo') delete row.costMethod;
    await db.accounts.put(row);
    phase.accountId = row.id;
  }
  return phases;
}

export function localChallenges(ctx: LocalContext): ChallengesRepo {
  return {
    async list(ws) {
      const db = await ctx.db();
      const rows = await db.challenges
        .where('workspaceId')
        .equals(ws)
        .toArray();
      return rows.sort(
        (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      );
    },

    async create(ws, input: NewChallenge) {
      // A breach is recorded with its reason and date, by markBreached only.
      if (input.status === 'breached')
        throw new RangeError(BREACH_THROUGH_MARK);
      const db = await ctx.db();
      const challenge = tidy({ ...input, id: ctx.newId(), workspaceId: ws });
      return rwTx(db, [db.challenges, db.accounts, db.strategies], async () => {
        await assertValid(db, challenge);
        await db.challenges.put(challenge);
        return challenge;
      });
    },

    async createMany(ws, items: NewChallengeEntry[]) {
      if (items.length === 0) throw new RangeError('Nothing to create');
      for (const { challenge, breach } of items) {
        // Only the entry's own `breach` records one, with its reason and date.
        if (challenge.status === 'breached')
          throw new RangeError(BREACH_THROUGH_MARK);
        if (breach) assertBreach(breach);
      }
      const db = await ctx.db();
      // One transaction: a failure on any item aborts the accounts and
      // challenges written before it.
      return rwTx(db, [db.challenges, db.accounts, db.strategies], async () => {
        const made: Challenge[] = [];
        for (const { challenge: input, newAccounts, breach } of items) {
          const phases = await linkNewAccounts(
            ctx,
            db,
            ws,
            input.phases,
            newAccounts,
          );
          // Only the trader's own words are kept, and only for 'other'.
          const note =
            breach?.reason === 'other' ? breach.note?.trim() : undefined;
          const challenge = tidy({
            ...input,
            phases,
            id: ctx.newId(),
            workspaceId: ws,
            ...(breach && {
              status: 'breached' as const,
              breachReason: breach.reason,
              breachedOn: breach.on,
              ...(note && { failureReason: note }),
            }),
          });
          await assertValid(db, challenge);
          await db.challenges.put(challenge);
          made.push(challenge);
        }
        return made;
      });
    },

    async update(ws, id, patch, newAccounts = []) {
      const db = await ctx.db();
      return rwTx(db, [db.challenges, db.accounts, db.strategies], async () => {
        const current = await db.challenges.get([ws, id]);
        if (!current) throw new NotFoundError('challenge', id);
        // A breach is permanent: the status never moves off it, and it locks
        // the phase (rec 3.4) and the steps (C-05: fewer steps would drop the
        // phase it broke in). The value it already has is no change.
        if (
          current.status === 'breached' &&
          ((patch.status !== undefined && patch.status !== 'breached') ||
            (patch.phase !== undefined && patch.phase !== current.phase) ||
            (patch.steps !== undefined && patch.steps !== current.steps) ||
            (patch.phases !== undefined &&
              patch.phases.map((p) => p.step).join() !==
                current.phases.map((p) => p.step).join()))
        )
          throw new ChallengeBreachedError(id);
        // A breach is recorded with its reason and date, by markBreached only.
        if (patch.status === 'breached' && current.status !== 'breached')
          throw new RangeError(BREACH_THROUGH_MARK);
        const linked =
          newAccounts.length > 0
            ? {
                phases: await linkNewAccounts(
                  ctx,
                  db,
                  ws,
                  patch.phases ?? current.phases,
                  newAccounts,
                ),
              }
            : {};
        const next = tidy({
          ...mergePatch(current, { ...patch, ...linked }, [
            'failureReason',
            'evaluationFee',
            'activationFee',
          ]),
          id,
          workspaceId: ws,
        });
        await assertValid(db, next);
        await db.challenges.put(next);
        return next;
      });
    },

    async markBreached(ws, id, input) {
      assertBreach(input);
      const db = await ctx.db();
      return rwTx(db, [db.challenges, db.accounts, db.strategies], async () => {
        const current = await db.challenges.get([ws, id]);
        if (!current) throw new NotFoundError('challenge', id);
        if (current.status === 'breached') throw new ChallengeBreachedError(id);
        // Only the trader's own words are kept, and only for 'other'.
        const note = input.reason === 'other' ? input.note?.trim() : undefined;
        const next = tidy({
          ...current,
          status: 'breached',
          breachReason: input.reason,
          breachedOn: input.on,
          ...(note && { failureReason: note }),
        });
        await db.challenges.put(next);
        return next;
      });
    },

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.challenges, db.propTxns], async () => {
        if (!(await db.challenges.get([ws, id])))
          throw new NotFoundError('challenge', id);
        // Its transactions stay, as the money they moved: only the link goes.
        const linked = await db.propTxns
          .where('workspaceId')
          .equals(ws)
          .filter((t) => t.challengeId === id)
          .toArray();
        await db.propTxns.bulkPut(
          linked.map((t) => {
            const next = { ...t };
            delete next.challengeId;
            return next;
          }),
        );
        await db.challenges.delete([ws, id]);
      });
    },
  };
}
