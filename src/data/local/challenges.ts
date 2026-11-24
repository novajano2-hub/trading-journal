import type { Challenge } from '@/domain/types';
import { mergePatch } from '../merge';
import {
  NotFoundError,
  type ChallengesRepo,
  type NewChallenge,
} from '../repository';
import type { LocalContext } from './context';
import type { KeelDb } from './db';
import { rwTx } from './tx';

const isDate = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
};

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

/** The challenge with its text trimmed and an empty failure reason left out. */
function tidy(c: Challenge): Challenge {
  const { failureReason, ...rest } = c;
  const reason = failureReason?.trim();
  return {
    ...rest,
    name: c.name.trim(),
    firm: c.firm.trim(),
    ...(reason ? { failureReason: reason } : {}),
  };
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
      const db = await ctx.db();
      const challenge = tidy({ ...input, id: ctx.newId(), workspaceId: ws });
      return rwTx(db, [db.challenges, db.accounts], async () => {
        await assertValid(db, challenge);
        await db.challenges.put(challenge);
        return challenge;
      });
    },

    async update(ws, id, patch) {
      const db = await ctx.db();
      return rwTx(db, [db.challenges, db.accounts], async () => {
        const current = await db.challenges.get([ws, id]);
        if (!current) throw new NotFoundError('challenge', id);
        const next = tidy({
          ...mergePatch(current, patch, [
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

    async remove(ws, id) {
      const db = await ctx.db();
      await rwTx(db, [db.challenges], async () => {
        if (!(await db.challenges.get([ws, id])))
          throw new NotFoundError('challenge', id);
        await db.challenges.delete([ws, id]);
      });
    },
  };
}
