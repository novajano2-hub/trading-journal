import { isValidTimeZone } from '@/domain/time';
import type {
  Account,
  JournalEntry,
  Rule,
  Strategy,
  Tag,
  Trade,
  UserPrefs,
  Workspace,
} from '@/domain/types';
import type { TradePatch } from './trade-patch';

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

// Workspace-scoped repositories: every call takes the workspace id.
// update/remove of a missing id throw NotFoundError (except trades.remove).

export interface TradesRepo {
  /** In serial order. */
  list(ws: string): Promise<Trade[]>;
  get(ws: string, id: string): Promise<Trade | undefined>;
  update(ws: string, id: string, patch: TradePatch): Promise<Trade>;
  /** Also drops the ids from journal links. Missing ids are ignored. */
  remove(ws: string, ids: readonly string[]): Promise<void>;
}

export type NewAccount = Omit<Account, 'id' | 'workspaceId'>;
export type AccountPatch = Partial<NewAccount>;
export interface AccountsRepo {
  /** By name. */
  list(ws: string): Promise<Account[]>;
  create(ws: string, input: NewAccount): Promise<Account>;
  update(ws: string, id: string, patch: AccountPatch): Promise<Account>;
  /** Also deletes the account's trades (and their journal links) and import jobs. */
  remove(ws: string, id: string): Promise<void>;
}

export type NewStrategy = Omit<Strategy, 'id' | 'workspaceId' | 'rules'> & {
  rules: (Omit<Rule, 'id'> & { id?: string })[];
};
export type StrategyPatch = Partial<NewStrategy>;
export interface StrategiesRepo {
  /** By name. */
  list(ws: string): Promise<Strategy[]>;
  get(ws: string, id: string): Promise<Strategy | undefined>;
  create(ws: string, input: NewStrategy): Promise<Strategy>;
  /** Rules without an id get one; changing rules drops stale RuleChecks on its trades. */
  update(ws: string, id: string, patch: StrategyPatch): Promise<Strategy>;
  /** Clears `strategyId` and `ruleChecks` on its trades. */
  remove(ws: string, id: string): Promise<void>;
}

export type NewTag = Omit<Tag, 'id' | 'workspaceId'>;
export type TagPatch = Partial<NewTag>;
/** A tag with this name (ignoring case) already exists in the workspace and category. */
export class DuplicateNameError extends Error {
  override name = 'DuplicateNameError';
  constructor(readonly duplicate: string) {
    super(`"${duplicate}" already exists`);
  }
}
export interface TagsRepo {
  /** By category, then name. */
  list(ws: string): Promise<Tag[]>;
  /** Names are trimmed. Throws DuplicateNameError. */
  create(ws: string, input: NewTag): Promise<Tag>;
  update(ws: string, id: string, patch: TagPatch): Promise<Tag>;
  /** Drops the id from every trade's `tagIds`. */
  remove(ws: string, id: string): Promise<void>;
}

export type JournalDraft = Omit<
  JournalEntry,
  'id' | 'workspaceId' | 'updatedAt'
> & { id?: string };
export interface JournalRepo {
  /** Date descending, undated last, then `updatedAt` descending. */
  list(ws: string): Promise<JournalEntry[]>;
  get(ws: string, id: string): Promise<JournalEntry | undefined>;
  listForTrade(ws: string, tradeId: string): Promise<JournalEntry[]>;
  /** Creates when `id` is absent, otherwise replaces; stamps `updatedAt`. */
  save(ws: string, draft: JournalDraft): Promise<JournalEntry>;
  /** Clears `noteId` on trades pointing at it. */
  remove(ws: string, id: string): Promise<void>;
}

export interface Repository {
  workspaces: WorkspacesRepo;
  prefs: PrefsRepo;
  trades: TradesRepo;
  accounts: AccountsRepo;
  strategies: StrategiesRepo;
  tags: TagsRepo;
  journal: JournalRepo;
}
