import type { BreakevenRange, PnlBasis } from '../types';

/**
 * Trade-behaviour patterns (Plan 6B spec §5.5, B20 to B25): rule-computed
 * flags read from a trader's fills, by trade and by day. Pure and never
 * stored; the ids and the names are Keel's own.
 */
export type PatternId =
  | 'held-longer'
  | 'long-loss-hold'
  | 'loss-after-loss'
  | 'added-to-position'
  | 'exited-in-parts'
  | 'large-size'
  | 'losses-outweighed'
  | 'switched-sides-red'
  | 'switched-sides-green'
  | 'one-strong-trade'
  | 'low-return'
  | 'sized-up-after-wins'
  | 'more-trades'
  | 'waited-then-won'
  | 'quick-reentries'
  | 'rushed-red-day'
  | 'busier-than-green';

export interface PatternDef {
  id: PatternId;
  level: 'trade' | 'day';
  /** B25: a word on each pattern, never a colour. */
  tone: 'helps' | 'hurts' | 'neutral';
  name: string;
}

/** Every pattern, trade level first; a result's hits come in this order. */
export const PATTERNS: readonly PatternDef[] = [
  {
    id: 'held-longer',
    level: 'trade',
    tone: 'neutral',
    name: 'Held longer than usual',
  },
  {
    id: 'long-loss-hold',
    level: 'trade',
    tone: 'hurts',
    name: 'Long hold on a loss',
  },
  {
    id: 'loss-after-loss',
    level: 'trade',
    tone: 'hurts',
    name: 'Loss after a loss',
  },
  {
    id: 'added-to-position',
    level: 'trade',
    tone: 'neutral',
    name: 'Added to the position',
  },
  {
    id: 'exited-in-parts',
    level: 'trade',
    tone: 'neutral',
    name: 'Exited in parts',
  },
  { id: 'large-size', level: 'trade', tone: 'neutral', name: 'Large size' },
  {
    id: 'losses-outweighed',
    level: 'day',
    tone: 'hurts',
    name: 'Losses outweighed wins',
  },
  {
    id: 'switched-sides-red',
    level: 'day',
    tone: 'hurts',
    name: 'Switched sides, red',
  },
  {
    id: 'switched-sides-green',
    level: 'day',
    tone: 'hurts',
    name: 'Switched sides, green',
  },
  {
    id: 'one-strong-trade',
    level: 'day',
    tone: 'helps',
    name: 'One strong trade',
  },
  {
    id: 'low-return',
    level: 'day',
    tone: 'hurts',
    name: 'Low return for the effort',
  },
  {
    id: 'sized-up-after-wins',
    level: 'day',
    tone: 'hurts',
    name: 'Sized up after wins',
  },
  {
    id: 'more-trades',
    level: 'day',
    tone: 'hurts',
    name: 'More trades than usual',
  },
  {
    id: 'waited-then-won',
    level: 'day',
    tone: 'helps',
    name: 'Waited, then won',
  },
  {
    id: 'quick-reentries',
    level: 'day',
    tone: 'hurts',
    name: 'Quick re-entries after a loss',
  },
  { id: 'rushed-red-day', level: 'day', tone: 'hurts', name: 'Rushed red day' },
  {
    id: 'busier-than-green',
    level: 'day',
    tone: 'neutral',
    name: 'Busier than a green day',
  },
];

/** One pattern that fired, with the figures its sentence quotes (cents, milliseconds, counts, ratios). */
export interface PatternHit {
  id: PatternId;
  /** Set on a trade-level hit. */
  tradeId?: string;
  /** Set on a day-level hit: the day's local date, YYYY-MM-DD. */
  date?: string;
  figures: Record<string, number>;
}

export interface PatternEnv {
  /** The profile zone: a trade's day is its date there. */
  timeZone: string;
  breakevenRange: BreakevenRange;
  /** 6A's session starts, by the day's date. */
  sessions: ReadonlyMap<string, { start: string }>;
  /** Which P&L decides a win, a loss and a day's colour; omitted: net. */
  pnlBasis?: PnlBasis;
}

const MINUTE_MS = 60_000;

/**
 * Every threshold of §5.5 and B20 to B22 in one place. The ones marked
 * "Keel threshold (U2)" are Keel's own readings of conditions TradeZella gives
 * only in words; the owner can adjust them here.
 */
export const THRESHOLDS = {
  /** B20: a look-back is the 60 days before the trade's entry, or before the day. */
  lookbackDays: 60,
  /** T3: held longer than this share of your trades with the same outcome. */
  heldLongerShare: 0.75,
  /** T7: a loss held longer than this share of your losses, and larger than their average. */
  longLossShare: 0.5,
  /** T8 (B21): a loss entered within this long of a losing trade's exit. */
  lossAfterLossMs: 30_000,
  /** T14, T15: two or more entries, two or more exits. */
  scaledFills: 2,
  /** T16: a volume above this share of your trades. */
  largeSizeShare: 0.75,

  // Keel threshold (U2) from here on: the day-level patterns.
  /** D1: a red day with a win rate of at least this... */
  outweighedWinRate: 0.5,
  /** D1: ...and an average loss at least this many times the average win. */
  outweighedRatio: 2,
  /** D3, D4: this many changes of side on a red or a green day. */
  flipChanges: 3,
  /** D5: one winning trade with a realized R of at least this. */
  strongR: 3,
  /** D7: at least this many trades, green, net below this share of the average green day. */
  lowReturnTrades: 3,
  lowReturnShare: 0.5,
  /** D9: a larger loss, in a larger size, after this many wins in a row. */
  sizedUpStreak: 3,
  /** D10: at least a third over the 60-day daily average, as the fraction 1/3. */
  moreTradesOver: { num: 1, den: 3 },
  /** D11: first entry this long after the session start, on a green day. */
  waitedMs: 90 * MINUTE_MS,
  /** D13: this many trades entered within this long of a loss's exit, and lost. */
  quickReentries: 2,
  quickReentryMs: MINUTE_MS,
  /** D14: a red day of at least this many trades, a median hold under and a median gap under. */
  rushedTrades: 5,
  rushedHoldMs: 5 * MINUTE_MS,
  rushedGapMs: 2 * MINUTE_MS,
  /** D15: at least this many times your average trade count on green days. */
  busierRatio: 2,
} as const;
