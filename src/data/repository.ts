import type {
  ImportBlock,
  ImportContext,
  ImportPlan,
} from '@/domain/import/plan';
import type { ManualTradeError } from '@/domain/manual-trade';
import { isValidTimeZone } from '@/domain/time';
import type {
  Account,
  Cents,
  ImportJob,
  Instrument,
  JournalEntry,
  NoteFolder,
  NoteTemplate,
  Rule,
  RuleGroup,
  Side,
  Strategy,
  Tag,
  TagCategory,
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
    displayUnit: 'dollar',
    hideTradeSummary: false,
    calendarStats: ['net', 'trades'],
    instrumentsTraded: [],
    settleExpiredOptions: true,
  };
}

// User-level repositories: they take no workspace id.

export interface WorkspacesRepo {
  list(): Promise<Workspace[]>;
  /** The sample until the user picks another. */
  getActive(): Promise<Workspace>;
  /** Throws NotFoundError for an unknown id. */
  setActive(id: string): Promise<void>;
  /** Regenerates the sample workspace, with the built-in templates; My workspace is untouched. */
  resetSample(): Promise<void>;
  /** Deletes everything in My workspace, then gives it back its built-in tag categories and templates; the sample is untouched. */
  clearUser(): Promise<void>;
}

export interface PrefsRepo {
  get(): Promise<UserPrefs>;
  /**
   * Shallow-merges `patch` over the stored prefs; a key set to undefined is left
   * unchanged. `goals` merges per workspace inside the write: each workspace the
   * patch names replaces that workspace's goals whole, and the others are kept,
   * so `{ goals: { [id]: {} } }` clears one workspace (see `withGoals`).
   * Throws RangeError for an unknown time zone, a breakeven range with
   * from > to, a goals entry that isn't an object of positive whole cents,
   * an unknown display unit, or calendar stats that aren't 1 to 3 known ones.
   */
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

/** The fills of a manual trade cannot make one trade; `error` says why, `fillIndex` which fill (0-based) when it is one. */
export class ManualTradeRejected extends Error {
  override name = 'ManualTradeRejected';
  constructor(
    readonly error: ManualTradeError,
    readonly fillIndex?: number,
  ) {
    super(`Manual trade rejected: ${error}`);
  }
}

/** A trade entered by hand: its own fills, never merged with imported ones. */
export interface ManualTradeInput {
  accountId: string;
  instrument: Instrument;
  fills: {
    time: string /* UTC ISO */;
    side: Side;
    qty: number;
    price: number;
    commission: Cents;
    fees: Cents;
  }[];
  plannedStop?: number;
  plannedTarget?: number;
}

export interface TradesRepo {
  /** In serial order. */
  list(ws: string): Promise<Trade[]>;
  get(ws: string, id: string): Promise<Trade | undefined>;
  /** Leaving a strategy drops the checks of its rules, unless the patch sets `ruleChecks`. */
  update(ws: string, id: string, patch: TradePatch): Promise<Trade>;
  /**
   * `update` on each id in one transaction, in the order given; a function
   * patch is called with each stored trade. Throws NotFoundError, writing
   * nothing, when any id is missing.
   */
  updateMany(
    ws: string,
    ids: readonly string[],
    patch: TradePatch | ((t: Trade) => TradePatch),
  ): Promise<Trade[]>;
  createManual(ws: string, input: ManualTradeInput): Promise<Trade>;
  replaceManual(
    ws: string,
    id: string,
    input: ManualTradeInput,
  ): Promise<Trade>;
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
  /** Throws `Error('account has trades')` while it has any: clear or archive it first. */
  remove(ws: string, id: string): Promise<void>;
  /** Removes its trades (and their journal links) and import jobs; returns the count of trades. */
  clearTrades(ws: string, id: string): Promise<number>;
}

/** A rule or group without an id gets one. */
export type RuleDraft = Omit<Rule, 'id'> & { id?: string };
export type RuleGroupDraft = Omit<RuleGroup, 'id' | 'rules'> & {
  id?: string;
  rules: RuleDraft[];
};
export type NewStrategy = Omit<Strategy, 'id' | 'workspaceId' | 'groups'> & {
  groups: RuleGroupDraft[];
};
export type StrategyPatch = Partial<NewStrategy>;
export interface StrategiesRepo {
  /** By name. */
  list(ws: string): Promise<Strategy[]>;
  get(ws: string, id: string): Promise<Strategy | undefined>;
  create(ws: string, input: NewStrategy): Promise<Strategy>;
  /** Groups and rules without an id get one; a rule that leaves drops its RuleChecks on its trades. */
  update(ws: string, id: string, patch: StrategyPatch): Promise<Strategy>;
  /** Takes it out of its trades' `strategyIds` and drops the checks of its rules there. */
  remove(ws: string, id: string): Promise<void>;
}

export type NewTag = Omit<Tag, 'id' | 'workspaceId'>;
export type TagPatch = Partial<NewTag>;
/** A tag (in its category) or a category with this name, ignoring case, already exists in the workspace. */
export class DuplicateNameError extends Error {
  override name = 'DuplicateNameError';
  constructor(readonly duplicate: string) {
    super(`"${duplicate}" already exists`);
  }
}
export interface TagsRepo {
  /** By category name, then name. */
  list(ws: string): Promise<Tag[]>;
  /**
   * Names are trimmed and stored lowercase. A tag of that name already in the
   * category is returned as it is. Throws NotFoundError for an unknown category.
   */
  create(ws: string, input: NewTag): Promise<Tag>;
  /** Throws DuplicateNameError when the name is taken in the category. */
  update(ws: string, id: string, patch: TagPatch): Promise<Tag>;
  /** Drops the id from every trade's `tagIds`. */
  remove(ws: string, id: string): Promise<void>;
}

export interface TagCategoriesRepo {
  /** By name. */
  list(ws: string): Promise<TagCategory[]>;
  /** Names are trimmed. Throws RangeError unless the colour is #RRGGBB, DuplicateNameError for a taken name. */
  create(
    ws: string,
    input: { name: string; color: string },
  ): Promise<TagCategory>;
  update(
    ws: string,
    id: string,
    patch: { name?: string; color?: string },
  ): Promise<TagCategory>;
  /** Refuses a built-in category (`Error('built-in category')`); removes its tags from trades, then the tags. */
  remove(ws: string, id: string): Promise<void>;
}

export type TemplateDraft = Omit<
  NoteTemplate,
  'id' | 'workspaceId' | 'builtIn'
> & { id?: string };
export interface TemplatesRepo {
  /** By kind, then name. */
  list(ws: string): Promise<NoteTemplate[]>;
  /**
   * Creates when `id` is absent, otherwise replaces (a built-in keeps its
   * kind). The kind keeps one default: saving a default clears the others,
   * and a kind left without one falls back to its built-in template.
   */
  save(ws: string, t: TemplateDraft): Promise<NoteTemplate>;
  /** Refuses a built-in template (`Error('built-in template')`). Removing the default makes the kind's built-in template the default. */
  remove(ws: string, id: string): Promise<void>;
  /** Clears `isDefault` on the kind's other templates. */
  setDefault(ws: string, id: string): Promise<void>;
}

export interface FoldersRepo {
  /** By name. */
  list(ws: string): Promise<NoteFolder[]>;
  /** The name is trimmed. Throws RangeError for an empty one and DuplicateNameError for one a folder already has, ignoring case. */
  create(ws: string, name: string): Promise<NoteFolder>;
  /** As `create` for the name; a folder keeps its id. Throws NotFoundError for a missing folder. */
  rename(ws: string, id: string, name: string): Promise<NoteFolder>;
  /** Moves the folder's notes, Trash included, to no folder (My notes). Throws NotFoundError for a missing folder. */
  remove(ws: string, id: string): Promise<void>;
}

export type JournalDraft = Omit<
  JournalEntry,
  'id' | 'workspaceId' | 'updatedAt'
> & { id?: string };
export interface JournalRepo {
  /**
   * Date descending, undated last, then `updatedAt` descending, Trash
   * included. Purges entries trashed more than 30 days ago first, clearing
   * `noteId` on the trades whose trade note it deletes.
   */
  list(ws: string): Promise<JournalEntry[]>;
  get(ws: string, id: string): Promise<JournalEntry | undefined>;
  /** The entries linked to the trade that are out of Trash. */
  listForTrade(ws: string, tradeId: string): Promise<JournalEntry[]>;
  /** Creates when `id` is absent, otherwise replaces; stamps `updatedAt`. */
  save(ws: string, draft: JournalDraft): Promise<JournalEntry>;
  /** Deletes for good and clears `noteId` on trades pointing at it. */
  remove(ws: string, id: string): Promise<void>;
  /** Moves it to Trash (`deletedAt`). */
  trash(ws: string, id: string): Promise<void>;
  restore(ws: string, id: string): Promise<void>;
  /**
   * The trade's note: its linked entry while that is out of Trash, else a new
   * `trade-note` entry titled "{symbol} : {d MMM yyyy}", created and set as
   * `trade.noteId` in one transaction. Throws NotFoundError for a missing trade.
   */
  ensureTradeNote(ws: string, tradeId: string): Promise<JournalEntry>;
  /** Opens the day's note or creates it from the default daily template. */
  dailyNote(ws: string, date: string): Promise<JournalEntry>;
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
  /** A later active import in the account rebuilt one of this import's trades, or trades the symbol of one undo would restore; undo that one first. */
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
   * import in the account rebuilt one of its trades or has trades in the
   * symbol of a trade the undo would restore. Throws NotFoundError for a
   * missing job; an undone job is left as it is.
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
  tagCategories: TagCategoriesRepo;
  templates: TemplatesRepo;
  folders: FoldersRepo;
  journal: JournalRepo;
  imports: ImportRepo;
}
