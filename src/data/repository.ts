import { isValidTimeZone } from '@/domain/time';
import type { UserPrefs, Workspace } from '@/domain/types';

export class NotFoundError extends Error {
  override name = 'NotFoundError';
  constructor(
    readonly entity: string,
    readonly id: string,
  ) {
    super(`No ${entity} with id "${id}"`);
  }
}

/** The local store cannot be opened (blocked, stalled, or no IndexedDB). */
export class StorageUnavailableError extends Error {
  override name = 'StorageUnavailableError';
}

const FALLBACK_TIME_ZONE = 'America/New_York';

export function defaultPrefs(): UserPrefs {
  let timeZone = FALLBACK_TIME_ZONE;
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(zone)) timeZone = zone;
  } catch {
    // keep the fallback
  }
  return {
    timeZone,
    baseCurrency: 'USD',
    breakevenRange: { unit: 'amount', from: 0, to: 0 },
    pnlBasis: 'net',
  };
}

// User-level repositories: they take no workspace id.

export interface WorkspacesRepo {
  list(): Promise<Workspace[]>;
  /** The sample until the user picks another. */
  getActive(): Promise<Workspace>;
  /** Throws NotFoundError for an unknown id. */
  setActive(id: string): Promise<void>;
  /** Regenerates the sample workspace; My workspace is untouched. */
  resetSample(): Promise<void>;
  /** Deletes everything in My workspace; the sample is untouched. */
  clearUser(): Promise<void>;
}

export interface PrefsRepo {
  get(): Promise<UserPrefs>;
  /** Throws RangeError for an unknown time zone or a breakeven range with from > to. */
  update(patch: Partial<UserPrefs>): Promise<UserPrefs>;
}

export interface Repository {
  workspaces: WorkspacesRepo;
  prefs: PrefsRepo;
}
