import type {
  ImportBlock,
  ImportContext,
  ImportPlan,
} from '@/domain/import/plan';
import { isValidTimeZone } from '@/domain/time';
import type {
  Account,
  ImportJob,
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

/**
 * The trade is an open position that an import wrote. Deleting it would leave
 * the next import's fills nothing to close, so they would open a phantom
 * opposite position. Undo the import (`importId`) instead.
 */
export class OpenImportedTradeError extends Error {
  override name = 'OpenImportedTradeError';
  constructor(
    readonly tradeId: string,
    readonly importId: string,
  ) {
    super(
      `Trade "${tradeId}" is an open position from import "${importId}"; undo the import instead`,
    );
  }
}

export interface TradesRepo {
  /** In serial order. */
  list(ws: string): Promise<Trade[]>;
  get(ws: string, id: string): Promise<Trade | undefined>;
  update(ws: string, id: string, patch: TradePatch): Promise<Trade>;
  /**
   * Also drops the ids from journal links. Missing ids are ignored. Throws
   * OpenImportedTradeError, deleting nothing, when any of them is an open
   * trade with an `importId`; closed trades and trades without one delete.
   */
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

/** The plan is blocked (`plan.blocked`), so there is nothing to commit. */
export class ImportBlockedError extends Error {
  override name = 'ImportBlockedError';
  constructor(readonly reason: ImportBlock) {
    super(`The import is blocked: ${reason}`);
  }
}

/** The plan was made from a context that no longer holds, so committing it could write wrong trades. */
export class StalePlanError extends Error {
  override name = 'StalePlanError';
  constructor(readonly reason: 'account-removed' | 'imports-changed') {
    super(`The import plan is stale: ${reason}`);
  }
}

export type UndoResult =
  | { ok: true }
  /** A later active import in the account rebuilt one of this import's trades, or trades a symbol it touched; undo that one first. */
  | { ok: false; reason: 'later-import-depends'; dependentJobId: string };

export interface ImportRepo {
  /** Newest commit first (then by `id`), without what dedupe and undo work from. */
  list(ws: string): Promise<ImportJob[]>;
  /** What `planImport` needs for the account. Throws NotFoundError for a missing account. */
  context(ws: string, accountId: string): Promise<ImportContext>;
  /**
   * Writes the plan's trades and its job, and remembers its point values.
   * References to tags, strategies, rules and notes deleted since the
   * context was read are dropped from the written trades.
   * Throws ImportBlockedError for a blocked plan, RangeError unless `ws`, the
   * plan and every row it writes or replaces are My workspace (rows also in
   * the plan's account), and StalePlanError, writing nothing,
   * when the account is gone, an import was committed or undone in the
   * workspace since the plan's context was read, or a job with the plan's
   * `importId` already exists (also an undone one).
   */
  commit(ws: string, plan: ImportPlan): Promise<ImportJob>;
  /**
   * Deletes the job's trades and restores the ones it replaced, except one
   * whose same-id replacement the user deleted, minus references to tags,
   * strategies, rules and notes deleted since. Refused while a later active
   * import in the account rebuilt one of its trades or has trades in a symbol
   * it touched. Throws NotFoundError for a missing job; an undone job is left
   * as it is.
   */
  undo(ws: string, jobId: string): Promise<UndoResult>;
}

export interface Repository {
  workspaces: WorkspacesRepo;
  prefs: PrefsRepo;
  trades: TradesRepo;
  accounts: AccountsRepo;
  strategies: StrategiesRepo;
  tags: TagsRepo;
  journal: JournalRepo;
  imports: ImportRepo;
}
