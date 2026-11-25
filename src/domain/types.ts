import type { ImportMapping } from './import/mapping';

export type Cents = number; // integer minor units of the P&L currency
export type AssetClass =
  'stock' | 'option' | 'future' | 'forex' | 'crypto' | 'cfd';
export type Side = 'buy' | 'sell';
export type Direction = 'long' | 'short';

export interface Instrument {
  symbol: string;
  root: string;
  assetClass: AssetClass;
  pointValue: number;
  tickSize: number;
  quoteCurrency: string;
  baseCurrency?: string;
  underlying?: string;
  expiry?: string /* YYYY-MM-DD */;
  strike?: number;
  right?: 'call' | 'put';
  /** What an option is written on, where known; entries without it are read by their root and multiplier. */
  optionOn?: 'stock' | 'future';
}
export interface Execution {
  id: string;
  accountId: string;
  symbol: string;
  side: Side;
  qty: number /* > 0 */;
  price: number;
  time: string /* UTC ISO */;
  fees: Cents;
  commission: Cents;
  orderId?: string;
}
export interface RuleCheck {
  ruleId: string;
  followed: boolean | null;
}
export interface Trade {
  id: string;
  serial: number;
  workspaceId: string;
  accountId: string;
  instrument: Instrument;
  direction: Direction;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  executions: Execution[];
  avgEntry: number;
  avgExit?: number;
  maxPosition: number;
  pnlCurrency: string;
  gross: Cents;
  fees: Cents /* fees + commission */;
  net: Cents;
  plannedStop?: number;
  plannedTarget?: number;
  initialRisk?: Cents;
  mae?: Cents;
  mfe?: Cents;
  /** Every strategy the trade follows; its rule checks are keyed by rule id, so each is graded on its own. */
  strategyIds: string[];
  tagIds: string[];
  rating?: 1 | 2 | 3 | 4 | 5;
  ruleChecks: RuleCheck[];
  noteId?: string;
  reviewed?: boolean;
  source?: 'import' | 'manual';
  /** The import that last built this trade. */
  importId?: string;
  /** Several profit levels; `plannedTarget` stays the single-level form. */
  targets?: LevelSide;
  /** Several stop levels; `plannedStop` stays the single-level form. */
  stops?: LevelSide;
  /** Overnight financing, signed; already inside `net`. */
  swap?: Cents;
  /** Set when the user joined or split the trade by hand. */
  grouping?: 'manual';
}
export type DrawdownType = 'static' | 'trailing' | 'eod-trailing';
export interface PropRuleSet {
  firm: string;
  phase: 'evaluation' | 'funded';
  profitTarget: Cents;
  dailyLossLimit: Cents;
  maxDrawdown: Cents;
  drawdownType: DrawdownType;
  minTradingDays: number;
  consistencyPct?: number /* 0..1 */;
  /** undefined: no time limit. */
  periodDays?: number;
  /** undefined: the drawdown floor is the starting balance. */
  drawdownFloor?: Cents;
}
export type AccountType = 'live' | 'demo' | 'prop-evaluation' | 'prop-funded';
export interface Account {
  id: string;
  workspaceId: string;
  name: string;
  broker: string;
  type: AccountType;
  currency: string;
  startingBalance: Cents;
  status: 'active' | 'archived';
  propRules?: PropRuleSet;
  /** The zone fill times are read in; undefined: the trader's own (`UserPrefs.timeZone`). */
  timeZone?: string;
  /** The column mapping the account's last import used. */
  importMapping?: ImportMapping;
}
/** A user-made group of tags. The built-in ones can be renamed and recoloured, not deleted. */
export interface TagCategory {
  id: string;
  workspaceId: string;
  name: string;
  color: string /* #RRGGBB */;
  /** 'mistake': its tags feed the mistake reports and the dashboard's mistakes card. */
  role?: 'mistake';
  builtIn: boolean;
}
export interface Tag {
  id: string;
  workspaceId: string;
  /** Stored lowercase, unique within its category. */
  name: string;
  categoryId: string;
  description?: string;
}
/** Which trades a rule is graded on, by their outcome. */
export type RuleShowWhen = 'always' | 'winner' | 'loser' | 'breakeven';
export interface Rule {
  id: string;
  text: string;
  showWhen: RuleShowWhen;
}
/** A strategy's own titled, ordered group of rules. */
export interface RuleGroup {
  id: string;
  title: string;
  rules: Rule[];
}
export const STRATEGY_ICONS = [
  'target',
  'lightning',
  'trend-up',
  'trend-down',
  'crosshair',
  'waves',
  'compass',
  'flag',
  'clock',
  'stack',
  'shield',
  'rocket',
] as const;
export type StrategyIcon = (typeof STRATEGY_ICONS)[number];
export type StrategyTone = 'accent' | 'info' | 'gain' | 'warn' | 'neutral';
export interface Strategy {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  assetClasses: AssetClass[];
  groups: RuleGroup[];
  checklist: string[];
  status: 'active' | 'archived';
  icon?: StrategyIcon;
  /** Stored for old data and ignored: every strategy wears the accent tile, its icon tells them apart. */
  tone?: StrategyTone;
  /** A `files` row id: the strategy's cover photo. */
  photoId?: string;
  /** The template the strategy was copied from. */
  templateId?: string;
}
/** A strategy's rules flattened: group order, then rule order. */
export function strategyRules(s: Strategy): Rule[] {
  return s.groups.flatMap((g) => g.rules);
}
export type JournalKind =
  'daily-review' | 'pre-market' | 'weekly-recap' | 'note' | 'trade-note';
export interface JournalEntry {
  id: string;
  workspaceId: string;
  kind: JournalKind;
  date?: string /* YYYY-MM-DD */;
  title: string;
  body: unknown /* Tiptap JSON */;
  linkedTradeIds: string[];
  /** A user folder; undefined: My notes, or the built-in folder its kind belongs to. */
  folderId?: string;
  favorite?: boolean;
  /** When it went to Trash; purged 30 days later. */
  deletedAt?: string;
  /** The note's own tags, separate from trade tags. */
  tags: string[];
  /** The template the note started from. */
  templateId?: string;
  updatedAt: string;
}
export interface NoteFolder {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
}
export interface NoteTemplate {
  id: string;
  workspaceId: string;
  name: string;
  kind: JournalKind;
  body: unknown /* Tiptap JSON */;
  /** One per kind: a new entry of the kind starts from it. */
  isDefault: boolean;
  builtIn: boolean;
}
export interface CashFlow {
  id: string;
  workspaceId: string;
  accountId: string;
  date: string /* YYYY-MM-DD */;
  amount: Cents /* + deposit, − withdrawal */;
  note?: string;
}
export type ChallengeStep = 'step-1' | 'step-2' | 'funded';
export interface Challenge {
  id: string;
  workspaceId: string;
  name: string;
  firm: string;
  steps: 1 | 2;
  phases: { step: ChallengeStep; accountId?: string; startDate?: string }[];
  phase: 'evaluation' | 'funded';
  status: 'active' | 'passed' | 'breached';
  failureReason?: string;
  evaluationFee?: Cents;
  activationFee?: Cents;
}
export interface ImportJob {
  id: string;
  workspaceId: string;
  accountId: string;
  fileName: string;
  mapping: ImportMapping;
  rowCount: number;
  tradeCount: number;
  skippedCount: number;
  duplicateCount: number;
  status: 'active' | 'undone';
  createdAt: string;
  undoneAt?: string;
}
export interface Workspace {
  id: string;
  name: string;
  kind: 'sample' | 'user';
}
/** Breakeven band, inclusive at both ends; percent ranges are fractions of Net ROI (0.001 = 0.1 %). */
export type BreakevenRange =
  | { unit: 'amount'; from: Cents; to: Cents }
  | { unit: 'percent'; from: number; to: number };
export type PnlBasis = 'net' | 'gross';
/** The first day of a week: TradeZella's Sunday, or Monday. */
export type WeekStart = 'sunday' | 'monday';
/** Light, dark, or whichever the device prefers. */
export type Appearance = 'system' | 'light' | 'dark';
export type DisplayUnit =
  'dollar' | 'percent' | 'privacy' | 'r' | 'ticks' | 'pips' | 'points';
export type CalendarStat =
  | 'net'
  | 'trades'
  | 'winRate'
  | 'rating'
  | 'r'
  | 'fees'
  | 'ticks'
  | 'pips'
  | 'points';
export interface UserPrefs {
  timeZone: string;
  baseCurrency: string;
  breakevenRange: BreakevenRange;
  pnlBasis: PnlBasis;
  displayName?: string;
  /** How every money figure shows. */
  displayUnit: DisplayUnit;
  /** The trade log's columns, in order; undefined: its default set. */
  tradeColumns?: string[];
  /** Overview figures the user switched off, as `group:figure` keys; undefined or empty: all show. */
  overviewHidden?: string[];
  hideTradeSummary: boolean;
  /** The day weeks start on, in the calendar, the weekly buckets, the week presets and the weekday order; undefined: Sunday. */
  weekStart?: WeekStart;
  /** What a calendar day shows: one or more of the stats, in the order chosen. */
  calendarStats: CalendarStat[];
  instrumentsTraded: AssetClass[];
  settleExpiredOptions: boolean;
  /** Light, dark, or the device's preference; undefined: System. */
  appearance?: Appearance;
  onboarding?: Onboarding;
  firstName?: string;
  lastName?: string;
  username?: string;
  /** The Day view's columns; undefined: its default set. */
  dayColumns?: string[];
  /** The Week view's columns; undefined: its default set. */
  weekColumns?: string[];
  /** Tips the user has dismissed. */
  seenTips?: string[];
  /** The stat-card rows shown on a trade; undefined: all. */
  tradeStats?: string[];
  /** The note editor's type sizes and checked-item style. */
  noteType?: NoteType;
  /** Whether the strategy chooser shows when a strategy is created; undefined: on. */
  strategyChooser?: boolean;
}

// ---- The daily routine -----------------------------------------------------

export type TrackerStage = 'prepare' | 'trade' | 'reflect';
/** Sunday first, as Date#getDay. */
export type Weekdays = [
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
];
export interface BuiltInRules {
  startBy: { on: boolean; time: string /* HH:mm */ };
  hours: { on: boolean; from: string; to: string /* HH:mm, profile zone */ };
  strategy: { on: boolean };
  stop: { on: boolean };
  lossPerTrade: {
    on: boolean;
    unit: 'amount' | 'percent';
    value: number /* Cents, or a fraction: 0.01 = 1% */;
  };
  lossPerDay: { on: boolean; amount: Cents };
}
export interface CustomRule {
  id: string;
  name: string;
  stage: TrackerStage;
  days: Weekdays;
}
export interface TrackerVersion {
  from: string /* YYYY-MM-DD */;
  tradingDays: Weekdays;
  builtIn: BuiltInRules;
  custom: CustomRule[];
}
export interface Tracker {
  id: 'tracker';
  workspaceId: string;
  startedOn: string;
  versions: TrackerVersion[] /* oldest first */;
  /** The sample's fixed today. */
  asOf?: string;
}
/** One account's inputs to a day's trade rules; summed across the selected accounts. */
export interface AccountDayInputs {
  opened: number;
  withStrategy: number;
  withStop: number;
  inHours: number;
  /** Opened in the base currency: the per-trade cap's y (K5, K24). */
  moneyOpened: number;
  /** Of those, within the per-trade cap, winners included (K5, K7). */
  withinTradeLoss: number;
  /** The largest single-trade loss among them, positive; 0 if none (K6). */
  largestLoss: Cents;
  /** Realized net booked on the date, base currency (K8, K24). */
  dayNet: Cents;
  /** A trade opened or exited on the date (K8). */
  booked: boolean;
  /** Trades left out of the money rules (K24). */
  otherCurrency: number;
}
export interface FrozenDay {
  version: TrackerVersion;
  inputs: Record<string /* accountId */, AccountDayInputs>;
  ticks: Record<string, boolean>;
  noteStartedAt?: string;
}
export interface DayRecord {
  id: string /* YYYY-MM-DD */;
  workspaceId: string;
  noteStartedAt?: string /* UTC ISO */;
  session?: { start: string; end?: string };
  ticks?: Record<string, boolean>;
  finishedAt?: string;
  locked?: FrozenDay;
  mood?: { value: 1 | 2 | 3 | 4 | 5; note?: string };
  rating?: 1 | 2 | 3 | 4 | 5;
}
export interface DayShot {
  id: string;
  workspaceId: string;
  date: string;
  bytes: ArrayBuffer;
  type: 'image/png' | 'image/jpeg';
  name: string;
  size: number;
  createdAt: string;
}
export interface SurveyAnswers {
  experience: string;
  capital: string[];
  broker: string;
  instruments: string[];
  goals: string[];
  heardFrom: string;
  heardFromOther?: string;
}
export interface Onboarding {
  status: 'done';
  at: string;
  survey?: SurveyAnswers;
  existing?: true;
}

// ---- Plan 6B: trade depth ---------------------------------------------------

export type LevelUnit =
  'price' | 'movement' | 'amount' | 'ticks' | 'points' | 'pips';
export interface Level {
  value: number;
  qty: number;
}
export interface LevelSide {
  unit: LevelUnit;
  levels: Level[];
}
export interface StoredFile {
  id: string;
  workspaceId: string;
  /** `trade:<id>`, `note:<id>` or `strategy:<id>`. */
  owner: string;
  bytes: ArrayBuffer;
  type: string;
  name: string;
  size: number;
  createdAt: string;
}
export interface NoteVersion {
  id: string;
  workspaceId: string;
  noteId: string;
  body: unknown;
  savedAt: string;
  kind: 'auto' | 'before-restore';
}
export type HistoryType =
  | 'trade'
  | 'account'
  | 'cash-flow'
  | 'strategy'
  | 'tag'
  | 'tag-category'
  | 'target-rule'
  | 'fee-rule'
  | 'import';
export type HistoryAction =
  'created' | 'edited' | 'deleted' | 'merged' | 'split' | 'moved' | 'undone';
export type HistorySource = 'you' | 'import' | 'rule' | 'system';
export interface HistoryRow {
  id: string;
  workspaceId: string;
  at: string;
  type: HistoryType;
  action: HistoryAction;
  source: HistorySource;
  entityId: string;
  label: string;
  field?: string;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
}
export interface RuleLevel {
  value: number;
  pct: number;
}
export interface TargetRule {
  id: string;
  workspaceId: string;
  accountId: string;
  assetClass: AssetClass | 'future-option';
  symbols: string[];
  target?: { unit: LevelUnit; levels: RuleLevel[] };
  stop?: { unit: LevelUnit; levels: RuleLevel[] };
  createdAt: string;
}
export interface FeeRule {
  id: string;
  workspaceId: string;
  accountId: string;
  assetClass: AssetClass | 'future-option';
  /** Empty: all symbols. */
  symbols: string[];
  mode: 'per-contract' | 'per-execution';
  applyOn: 'all' | 'entry' | 'exit';
  commission: Cents;
  fee: Cents;
  createdAt: string;
}
export interface MissedTrade {
  id: string;
  workspaceId: string;
  strategyId: string;
  symbol: string;
  /** UTC ISO. */
  at: string;
  price?: number;
  commission?: Cents;
  fees?: Cents;
}
export interface NoteType {
  h1: number;
  h2: number;
  h3: number;
  body: number;
  strikeChecked: boolean;
}
