import type { DisplayUnit, Trade } from '../types';
import { pnlOf, type PnlBasis } from './context';

/** The units a figure can carry besides money, a percentage and Privacy. */
export type TradeUnit = 'r' | 'ticks' | 'pips' | 'points';

export const TRADE_UNITS: readonly TradeUnit[] = [
  'r',
  'ticks',
  'pips',
  'points',
];

/** Whether the unit is one a trade has to carry: the four that narrow the trade set. */
export function isTradeUnit(unit: DisplayUnit | undefined): unit is TradeUnit {
  return (TRADE_UNITS as readonly string[]).includes(unit ?? '');
}

/**
 * Which trades a display unit reads (Part 2 ruling U1): Ticks and Points the
 * futures trades, Pips the forex trades, R the trades with an initial risk.
 * Dollar, Percentage and Privacy read every trade. A narrowing unit narrows
 * the trade set itself, so every count, rate and day reads only these.
 */
export function unitKeeps(unit: DisplayUnit, t: Trade): boolean {
  switch (unit) {
    case 'ticks':
    case 'points':
      return t.instrument.assetClass === 'future';
    case 'pips':
      return t.instrument.assetClass === 'forex';
    case 'r':
      return t.initialRisk !== undefined && t.initialRisk > 0;
    default:
      return true;
  }
}

/** Realized R: P&L on the basis / initialRisk, only when initialRisk > 0. */
export function rOf(trade: Trade, basis: PnlBasis): number | undefined {
  if (trade.initialRisk === undefined || !(trade.initialRisk > 0))
    return undefined;
  return pnlOf(trade, basis) / trade.initialRisk;
}

/** Rounds away binary noise: 0.00205 / 0.0001 is 20.499999999999996. */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/** The quantity the trade's exits closed; its size when it has no fills. */
function closedQty(t: Trade): number {
  if (t.executions.length === 0) return t.maxPosition;
  return t.executions.reduce(
    (n, e) => ((e.side === 'buy') !== (t.direction === 'long') ? n + e.qty : n),
    0,
  );
}

/** A trade in each unit it has; a unit it has no value in is null. */
export interface TradeUnits {
  r: number | null;
  ticks: number | null;
  pips: number | null;
  points: number | null;
}

/**
 * One trade's move in each unit: (avg exit − avg entry) in the trade's
 * direction, per contract or lot, in points (futures); over the pip of 0.0001,
 * or 0.01 for a JPY quote (pips, forex). Ticks are the points over the tick
 * size times the contracts the exits closed (Q3, settled on the sample's
 * Futures live: +8,495 ticks). R is the P&L on the basis over the initial
 * risk. A trade with no exit has no price move.
 */
export function tradeUnits(t: Trade, basis: PnlBasis): TradeUnits {
  const r = rOf(t, basis);
  const { instrument } = t;
  const move =
    t.avgExit === undefined
      ? null
      : (t.avgExit - t.avgEntry) * (t.direction === 'long' ? 1 : -1);
  const future = instrument.assetClass === 'future';
  const forex = instrument.assetClass === 'forex';
  const pip = instrument.quoteCurrency === 'JPY' ? 0.01 : 0.0001;
  return {
    r: r === undefined ? null : r,
    ticks:
      move !== null && future && instrument.tickSize > 0
        ? clean((move / instrument.tickSize) * closedQty(t))
        : null,
    pips: move !== null && forex ? clean(move / pip) : null,
    points: move !== null && future ? clean(move) : null,
  };
}

/** The trade's value in one unit, or null when it has none there. */
export function unitOf(
  t: Trade,
  unit: TradeUnit,
  basis: PnlBasis,
): number | null {
  return tradeUnits(t, basis)[unit];
}
