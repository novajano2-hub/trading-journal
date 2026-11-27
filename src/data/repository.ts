import type {
  ImportBlock,
  ImportContext,
  ImportPlan,
} from '@/domain/import/plan';
import type { ManualTradeError } from '@/domain/manual-trade';
import { isValidTimeZone } from '@/domain/time';
import type {
  Account,
  BreachReason,
  CashFlow,
  Cents,
  Challenge,
  ChallengeStep,
  CostMethod,
  DayRecord,
  DayShot,
  FrozenDay,
  ImportJob,
  Instrument,
  JournalEntry,
  NoteFolder,
  NoteTemplate,
  PropTxn,
  Rule,
  RuleGroup,
  Side,
  Strategy,
  SurveyAnswers,
  Tag,
  TagCategory,
  Tracker,
  TrackerVersion,
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
    calendarStats: ['net', 'trades', 'winRate', 'rating'],
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
   * unchanged. A `goals` key an older version stored is ignored on read and
   * left in storage. Throws RangeError for an unknown time zone, a breakeven
   * range with from > to, an unknown display unit, or calendar stats that
   * aren't 1 to 3 known ones.
   */
  update(patch: Partial<UserPrefs>): Promise<UserPrefs>;
  /** Only the prefs the user has set: the rest follow the defaults (the browser's time zone, say). */
  saved(): Promise<Partial<UserPrefs>>;
  /** Forgets the saved value of each key, so it follows the default again. Returns the prefs as they are then. */
  unset(keys: readonly (keyof UserPrefs)[]): Promise<UserPrefs>;
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

/**
 * The trades belong to an archived account, which is read-only: nothing in
 * `tradeIds` was changed. Unarchive the account to edit them.
 */
export class ArchivedAccountError extends Error {
  override name = 'ArchivedAccountError';
  constructor(
    readonly accountIds: readonly string[],
    readonly tradeIds: readonly string[] = [],
  ) {
    super(`Account ${accountIds.join(', ')} is archived and read-only`);
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
  /** Also deletes the account's cash flows. Throws `Error('account has trades')` while it has any: clear or archive it first. */
  remove(ws: string, id: string): Promise<void>;
  /** Removes its trades (and their journal links) and import jobs; returns the count of trades. */
  clearTrades(ws: string, id: string): Promise<number>;
  /**
   * Sets the account's cost method and rebuilds each of its trades from their
   * stored executions under it, in one transaction (C40): ids, journal fields
   * and everything not derived from the fills are kept. FIFO is stored as
   * unset. Throws NotFoundError for a missing account and ArchivedAccountError,
   * changing nothing, for an archived one. `update` with a `costMethod` that
   * differs does the same.
   */
  setCostMethod(ws: string, id: string, method: CostMethod): Promise<Account>;
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
   * kind). The kind keeps at most one default: saving a default clears the
   * others, and saving the default without `isDefault` leaves the kind with
   * none (a new note of that kind then starts empty).
   */
  save(ws: string, t: TemplateDraft): Promise<NoteTemplate>;
  /** Refuses a built-in template (`Error('built-in template')`). Removing the default leaves the kind without one. */
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
  /**
   * Creates when `id` is absent, otherwise replaces; stamps `updatedAt`. Throws
   * LockedDayError for a daily note on a finished date. The first save of a
   * daily note on the routine's today stamps the day's `noteStartedAt` (K9).
   */
  save(ws: string, draft: JournalDraft): Promise<JournalEntry>;
  /** Deletes for good and clears `noteId` on trades pointing at it. Trash, restore and remove throw LockedDayError for a finished date's daily note. */
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
  /** The date's daily note, trashed or not (E109), or a new one from the default daily template. Throws LockedDayError rather than create one on a finished date. */
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
   * missing job, and ArchivedAccountError, changing nothing, when the job's
   * account (or an account of a trade it would delete or restore) is
   * archived; an undone job is left as it is.
   */
  undo(ws: string, jobId: string): Promise<UndoResult>;
}

export type NewCashFlow = Omit<CashFlow, 'id' | 'workspaceId'>;
export type CashFlowPatch = Partial<NewCashFlow>;
export interface CashFlowsRepo {
  /** Newest date first. */
  list(ws: string): Promise<CashFlow[]>;
  /**
   * The note is trimmed (an empty one is left out). Throws NotFoundError for
   * an unknown account and RangeError for a date that isn't a real
   * YYYY-MM-DD or an amount that isn't a nonzero whole number of cents.
   */
  create(ws: string, input: NewCashFlow): Promise<CashFlow>;
  /** As `create` for what it sets; a `note` of undefined keeps it, an empty one clears it. */
  update(ws: string, id: string, patch: CashFlowPatch): Promise<CashFlow>;
  remove(ws: string, id: string): Promise<void>;
}

export type NewChallenge = Omit<Challenge, 'id' | 'workspaceId'>;
export type ChallengePatch = Partial<NewChallenge>;
/** An account to create and link to the phase `step` of a challenge, which must have none yet. */
export interface NewChallengeAccount {
  step: ChallengeStep;
  account: NewAccount;
}
/** One challenge for `createMany`, with the accounts it makes and, optionally, the breach it is born with. */
export interface NewChallengeEntry {
  /** A phase with an `accountId` links that existing account. */
  challenge: NewChallenge;
  newAccounts: NewChallengeAccount[];
  /**
   * Creates the challenge already breached (TradeZella's create form offers
   * active or breached): `status`, `breachReason`, `breachedOn` and, for
   * 'other', the trimmed `note` as the failure reason, as `markBreached` writes them.
   */
  breach?: { reason: BreachReason; note?: string; on: string };
}
export interface ChallengesRepo {
  /** By name. */
  list(ws: string): Promise<Challenge[]>;
  /**
   * Throws RangeError for a blank name or firm, phases that aren't `step-1`,
   * then `step-2` for a two-step challenge, then `funded`, fees that aren't
   * whole non-negative cents, or a start date that isn't a real YYYY-MM-DD;
   * NotFoundError for a linked account that isn't in the workspace; and
   * RangeError for one account linked to two phases, and for `status:
   * 'breached'` (a breach goes through `markBreached`, which records the
   * reason and the date).
   */
  create(ws: string, input: NewChallenge): Promise<Challenge>;
  /**
   * Creates every challenge, with the new accounts each asks for linked to its
   * phases, in ONE transaction: all of them or none, so a failure part way
   * leaves no orphan account and no part of a quantity. Each is checked as
   * `create` checks it (a bare `status: 'breached'` is refused), RangeError
   * for no entries, a new account for a phase the challenge lacks or one
   * already linked, and a bad `breach` date or reason (the form makes
   * "Create breached" through it). Returns them in order.
   */
  createMany(ws: string, items: NewChallengeEntry[]): Promise<Challenge[]>;
  /**
   * As `create` for what it sets; a key set to undefined is left unchanged,
   * except `failureReason` and the fees, which it clears. Throws NotFoundError
   * for an unknown id, ChallengeBreachedError (writing nothing) for a breached
   * challenge's `status`, `phase` or `steps` set to a different value or its
   * `phases` set to a different list of steps (an account link or a start date
   * still edits), and RangeError for `status: 'breached'` on one that is not
   * (that goes through `markBreached`, which records the reason and the date).
   * `newAccounts` are created and linked to their phases in the same
   * transaction, so a refused update leaves no account behind (RangeError for
   * a phase the challenge lacks or one already linked).
   */
  update(
    ws: string,
    id: string,
    patch: ChallengePatch,
    newAccounts?: NewChallengeAccount[],
  ): Promise<Challenge>;
  /**
   * Marks the challenge breached, for good: `status`, `breachReason` and
   * `breachedOn` (a real YYYY-MM-DD) are written, and for 'other' a non-blank
   * `note` becomes the failure reason; the phase and any earlier text stay.
   * Throws ChallengeBreachedError, writing nothing, for a challenge already
   * breached (one breached before reasons existed too), RangeError for a bad
   * date or reason, NotFoundError for an unknown id. `update` refuses any
   * status or phase change on a breached challenge the same way. Removing a challenge
   * unlinks its prop transactions and keeps them.
   */
  markBreached(
    ws: string,
    id: string,
    input: { reason: BreachReason; note?: string; on: string },
  ): Promise<Challenge>;
  remove(ws: string, id: string): Promise<void>;
}

/** The challenge is breached, and a breach is permanent: it can't be marked again or move to another status or phase. */
export class ChallengeBreachedError extends Error {
  override name = 'ChallengeBreachedError';
  constructor(readonly challengeId: string) {
    super(`Challenge "${challengeId}" is breached, and a breach is permanent`);
  }
}

export type NewPropTxn = Omit<PropTxn, 'id' | 'workspaceId'>;
export type PropTxnPatch = Partial<NewPropTxn>;
export interface PropTxnsRepo {
  /** Newest date first, then by id. */
  list(ws: string): Promise<PropTxn[]>;
  /**
   * The text is trimmed (an empty description is left out; a blank firm reads
   * None). Throws RangeError for a date that isn't a real YYYY-MM-DD, an
   * amount that isn't a nonzero whole number of cents, or an unknown category
   * or status; NotFoundError for a challenge that isn't in the workspace.
   */
  add(ws: string, input: NewPropTxn): Promise<PropTxn>;
  /** As `add` for what it sets; a key set to undefined is left unchanged, except `description` and `challengeId`, which it clears. */
  update(ws: string, id: string, patch: PropTxnPatch): Promise<PropTxn>;
  /** For good. Throws NotFoundError for an unknown id. */
  remove(ws: string, id: string): Promise<void>;
  /**
   * Log a payout (C29): a `payout` row linked to the funded challenge, in its
   * firm, not yet reviewed, written in one transaction with the challenge
   * read. It counts in total earned at once and writes no withdrawal. Throws
   * RangeError for an amount that is not a positive whole number of cents or
   * a date that is not a real YYYY-MM-DD; NotFoundError for a challenge that
   * is not in the workspace; PayoutRefusedError, writing nothing, for one not
   * in its funded phase ('not-funded') or breached ('breached').
   */
  logPayout(
    ws: string,
    input: {
      challengeId: string;
      amount: Cents;
      date: string;
      description?: string;
    },
  ): Promise<PropTxn>;
}

/** A payout is only logged on a funded account: the challenge is still in an evaluation, or is breached. */
export class PayoutRefusedError extends Error {
  override name = 'PayoutRefusedError';
  constructor(
    readonly challengeId: string,
    readonly reason: 'not-funded' | 'breached',
  ) {
    super(
      reason === 'breached'
        ? `Challenge "${challengeId}" is breached, so no payout can be logged on it`
        : `Challenge "${challengeId}" is not in its funded phase, so no payout can be logged on it`,
    );
  }
}

/** The date is finished: nothing on it can change. */
export class LockedDayError extends Error {
  override name = 'LockedDayError';
  constructor() {
    super('day is finished');
  }
}

/** A screenshot Keel won't keep. */
export class ShotRejected extends Error {
  override name = 'ShotRejected';
  constructor(readonly reason: 'type' | 'size' | 'quota') {
    super(`The screenshot was refused: ${reason}`);
  }
}

export const SHOT_MAX_BYTES = 10 * 1024 * 1024;

export interface TrackerRepo {
  /** Created on first read, in one transaction, with startedOn = today and defaultVersion(today); two calls never make two rows. */
  get(ws: string): Promise<Tracker>;
  /** K16: a version from today, replacing one already dated today. */
  save(ws: string, rules: Omit<TrackerVersion, 'from'>): Promise<Tracker>;
  /**
   * K17: defaultVersion(today), startedOn today, asOf kept; clears the ticks of unfinished days.
   * Finished days stay locked: TradeZella shows no unlock (P6A-04), and days before the new start are unscored anyway.
   */
  reset(ws: string): Promise<Tracker>;
}

export interface DaysRepo {
  list(ws: string): Promise<DayRecord[]>;
  /** Today only, once a day; RangeError otherwise. */
  startSession(ws: string, date: string): Promise<DayRecord>;
  endSession(ws: string, date: string): Promise<DayRecord>;
  setTick(
    ws: string,
    date: string,
    ruleId: string,
    ticked: boolean,
  ): Promise<DayRecord>;
  setRating(
    ws: string,
    date: string,
    rating: 1 | 2 | 3 | 4 | 5 | undefined,
  ): Promise<DayRecord>;
  setMood(
    ws: string,
    date: string,
    mood: DayRecord['mood'],
  ): Promise<DayRecord>;
  /** Refuses (RangeError) a date after today, before startedOn, or not a trading day; LockedDayError when finished. Ends a running session. */
  finish(ws: string, date: string, frozen: FrozenDay): Promise<DayRecord>;
}

export interface DayShotsRepo {
  /** Upload order. */
  list(ws: string, date: string): Promise<DayShot[]>;
  add(
    ws: string,
    date: string,
    file: { bytes: ArrayBuffer; type: string; name: string },
  ): Promise<DayShot>;
  remove(ws: string, id: string): Promise<void>;
}

export interface FirstRunInput {
  firstName: string;
  lastName: string;
  username: string;
  baseCurrency: string;
  timeZone: string;
  survey?: SurveyAnswers;
}
export interface OnboardingRepo {
  /**
   * One transaction: prefs (names, currency, zone, the onboarding flag); "My account" in My workspace in that
   * currency when it has none; My workspace active. RangeError for a bad username, zone or currency, with nothing written.
   */
  complete(input: FirstRunInput): Promise<void>;
}

export interface Repository {
  workspaces: WorkspacesRepo;
  prefs: PrefsRepo;
  trades: TradesRepo;
  accounts: AccountsRepo;
  cashFlows: CashFlowsRepo;
  challenges: ChallengesRepo;
  strategies: StrategiesRepo;
  tags: TagsRepo;
  tagCategories: TagCategoriesRepo;
  templates: TemplatesRepo;
  folders: FoldersRepo;
  journal: JournalRepo;
  tracker: TrackerRepo;
  days: DaysRepo;
  dayShots: DayShotsRepo;
  imports: ImportRepo;
  onboarding: OnboardingRepo;
  propTxns: PropTxnsRepo;
}
