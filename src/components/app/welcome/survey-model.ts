import type { SurveyAnswers } from '@/domain/types';
import { CAPITAL_NOT_YET, HEARD_OTHER, STEPS } from '@/content/onboarding';

export const STEP_COUNT = STEPS.length;

/** The answers so far; a step is unanswered while its fields are missing. */
export type Draft = Partial<{
  experience: string;
  capital: string[];
  broker: string;
  instruments: string[];
  goals: string[];
  heardFrom: string;
  heardFromOther: string;
}>;

/** Whether step `n` (1 to 6) has its answer, which is what lets Continue go. */
export function isAnswered(n: number, d: Draft): boolean {
  switch (n) {
    case 1:
      return !!d.experience;
    case 2:
      return (d.capital?.length ?? 0) > 0;
    case 3:
      return !!d.broker;
    case 4:
      return (d.instruments?.length ?? 0) > 0;
    case 5:
      return (d.goals?.length ?? 0) > 0;
    case 6:
      return (
        !!d.heardFrom &&
        (d.heardFrom !== HEARD_OTHER || !!d.heardFromOther?.trim())
      );
    default:
      return false;
  }
}

/** The first step still to answer, 1 to 6; 6 once every step has an answer. */
export function firstUnanswered(d: Draft): number {
  for (let n = 1; n <= STEP_COUNT; n++) if (!isAnswered(n, d)) return n;
  return STEP_COUNT;
}

export function allAnswered(d: Draft): boolean {
  for (let n = 1; n <= STEP_COUNT; n++) if (!isAnswered(n, d)) return false;
  return true;
}

/** Several at once: the choice, in or out. */
export function toggle(
  list: readonly string[] | undefined,
  id: string,
): string[] {
  const now = list ?? [];
  return now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
}

/** K47: choosing Not yet clears the other two, and choosing either of them clears Not yet. */
export function toggleCapital(
  list: readonly string[] | undefined,
  id: string,
): string[] {
  const now = list ?? [];
  if (now.includes(id)) return now.filter((x) => x !== id);
  return id === CAPITAL_NOT_YET
    ? [CAPITAL_NOT_YET]
    : [...now.filter((x) => x !== CAPITAL_NOT_YET), id];
}

/** The stored answers (U2), once every step is answered. */
export function toAnswers(d: Draft): SurveyAnswers | undefined {
  if (!allAnswered(d)) return undefined;
  const other = d.heardFromOther?.trim();
  return {
    experience: d.experience!,
    capital: d.capital!,
    broker: d.broker!,
    instruments: d.instruments!,
    goals: d.goals!,
    heardFrom: d.heardFrom!,
    ...(d.heardFrom === HEARD_OTHER && other ? { heardFromOther: other } : {}),
  };
}

// ---- The answers for the browser session (K55) ----------------------------

export const FIRST_RUN_KEY = 'keel:first-run';

export interface FirstRunState {
  draft: Draft;
  /** The survey is done; the preferences dialog is next. */
  finished: boolean;
}

/** Private windows can throw on storage, so the flow also holds the state in memory for the tab. */
let memory: FirstRunState = { draft: {}, finished: false };

function isStrings(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Only well-formed fields come back, so a stale or edited value can't break a step. */
function parse(raw: string): FirstRunState | undefined {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return undefined;
    const o = v as Record<string, unknown>;
    const d = (
      typeof o.draft === 'object' && o.draft !== null ? o.draft : {}
    ) as Record<string, unknown>;
    const draft: Draft = {};
    for (const k of [
      'experience',
      'broker',
      'heardFrom',
      'heardFromOther',
    ] as const)
      if (typeof d[k] === 'string') draft[k] = d[k];
    for (const k of ['capital', 'instruments', 'goals'] as const) {
      const list = d[k];
      if (isStrings(list)) draft[k] = list;
    }
    return { draft, finished: o.finished === true && allAnswered(draft) };
  } catch {
    return undefined;
  }
}

export function readFirstRun(): FirstRunState {
  try {
    const raw = window.sessionStorage.getItem(FIRST_RUN_KEY);
    const stored = raw === null ? undefined : parse(raw);
    if (stored) return stored;
  } catch {
    // storage is unavailable: the tab's memory has the answers
  }
  return memory;
}

export function writeFirstRun(state: FirstRunState): void {
  memory = state;
  try {
    window.sessionStorage.setItem(FIRST_RUN_KEY, JSON.stringify(state));
  } catch {
    // kept in memory for the tab
  }
}

/** After the dialog is saved: nothing of the survey is needed again. */
export function clearFirstRun(): void {
  memory = { draft: {}, finished: false };
  try {
    window.sessionStorage.removeItem(FIRST_RUN_KEY);
  } catch {
    // nothing to clear
  }
}
