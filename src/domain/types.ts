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
  strategyId?: string;
  tagIds: string[];
  rating?: 1 | 2 | 3 | 4 | 5;
  ruleChecks: RuleCheck[];
  noteId?: string;
  /** The import that last built this trade. */
  importId?: string;
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
}
export type TagCategory = 'setup' | 'mistake' | 'emotion' | 'custom';
export interface Tag {
  id: string;
  workspaceId: string;
  name: string;
  category: TagCategory;
}
export type RuleGroup = 'entry' | 'exit' | 'risk' | 'management';
export interface Rule {
  id: string;
  text: string;
  group: RuleGroup;
}
export interface Strategy {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  assetClasses: AssetClass[];
  rules: Rule[];
  checklist: string[];
  status: 'active' | 'archived';
}
export type JournalKind =
  'daily-review' | 'pre-market' | 'weekly-recap' | 'note';
export interface JournalEntry {
  id: string;
  workspaceId: string;
  kind: JournalKind;
  date?: string /* YYYY-MM-DD */;
  title: string;
  body: unknown /* Tiptap JSON */;
  linkedTradeIds: string[];
  folder?: string;
  updatedAt: string;
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
/** One workspace's goals, in its base currency. A missing field means that goal isn't set. */
export interface Goals {
  weeklyNet?: Cents;
  dailyLossLimit?: Cents;
}
export interface UserPrefs {
  timeZone: string;
  baseCurrency: string;
  breakevenRange: BreakevenRange;
  pnlBasis: PnlBasis;
  /** Goals per workspace id; a workspace with no entry has none set (the sample workspace falls back to its defaults). */
  goals?: Record<string, Goals>;
}
