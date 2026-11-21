import { parseDecimal } from '@/domain/import/numbers';
import { toCents } from '@/domain/money';
import type { Cents, Goals, UserPrefs, Workspace } from '@/domain/types';

/** What the sample workspace shows until the user edits its goals. */
export const SAMPLE_GOALS: Required<Goals> = {
  weeklyNet: 50000,
  dailyLossLimit: 60000,
};

export function goalsFor(prefs: UserPrefs, workspace: Workspace): Goals {
  return (
    prefs.goals?.[workspace.id] ??
    (workspace.kind === 'sample' ? SAMPLE_GOALS : {})
  );
}

/**
 * The `PrefsRepo.update` patch for one workspace's goals. It names only that
 * workspace; the repository merges per workspace inside its transaction, so
 * stale cached prefs can't overwrite the others. `{}` clears the workspace.
 */
export function withGoals(
  _prefs: UserPrefs,
  workspaceId: string,
  goals: Goals,
): Pick<UserPrefs, 'goals'> {
  const clean = Object.fromEntries(
    Object.entries(goals).filter(([, v]) => v !== undefined),
  ) as Goals;
  return { goals: { [workspaceId]: clean } };
}

export type GoalAmount =
  { ok: true; cents: Cents | undefined } | { ok: false; message: string };

export function parseGoalAmount(raw: string): GoalAmount {
  const s = raw.trim().replace(/[$,\s]/g, '');
  if (s === '') return { ok: true, cents: undefined };
  const n = parseDecimal(s, '.');
  if (n === null) return { ok: false, message: 'Enter an amount, like 1,500.' };
  const cents = toCents(n);
  if (cents <= 0)
    return {
      ok: false,
      message: 'Enter an amount above zero, or leave it empty.',
    };
  return { ok: true, cents };
}
