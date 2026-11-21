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
 * other workspaces' goals are never read or overwritten here. `{}` clears the
 * workspace.
 */
export function withGoals(
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

/** The largest goal a field accepts: $10,000,000, in cents. */
export const MAX_GOAL_CENTS = 1_000_000_000;

/** Whole dollars (thousands commas optional), then exactly two decimals or none. */
const AMOUNT = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d+))?$/;

/**
 * A goal field's text as cents. Empty clears the goal. Otherwise whole
 * dollars with optional thousands commas and "$", or exactly two decimals:
 * anything that could be read two ways (12,34 or 1.234) is refused, never
 * guessed, and so is a bare "$". Each message says what to enter.
 */
export function parseGoalAmount(raw: string): GoalAmount {
  let body = raw.trim();
  if (body === '') return { ok: true, cents: undefined };
  // A sign before or after the "$" only earns the "above zero" message.
  let negative = false;
  const strip = (mark: string) => {
    if (!body.startsWith(mark)) return;
    if (mark === '-') negative = true;
    body = body.slice(1).trimStart();
  };
  strip('-');
  strip('$');
  strip('-');
  if (body === '')
    return {
      ok: false,
      message: 'Enter an amount, or leave it empty to clear the goal.',
    };

  const m = AMOUNT.exec(body);
  if (!m) {
    const commas = /^[\d,]+(?:\.\d+)?$/.test(body) && body.includes(',');
    return {
      ok: false,
      message: commas
        ? 'Use commas only for thousands, like 1,500.'
        : 'Enter an amount, like 1,500.',
    };
  }
  const [, dollars = '', decimals] = m;
  if (decimals !== undefined && decimals.length !== 2)
    return { ok: false, message: 'Use two decimals for cents, like 1,500.50.' };
  const cents =
    Number(dollars.replaceAll(',', '')) * 100 + Number(decimals ?? 0);
  if (negative || cents <= 0)
    return {
      ok: false,
      message: 'Enter an amount above zero, or leave it empty.',
    };
  if (cents > MAX_GOAL_CENTS)
    return { ok: false, message: 'Enter an amount up to $10,000,000.' };
  return { ok: true, cents };
}
