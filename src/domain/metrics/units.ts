import type { DisplayUnit, Trade } from '../types';
import { pnlOf, type PnlBasis } from './context';
import {
  exitShare,
  sizedRealizations,
  type SizedRealization,
} from './realized';

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
export function closedQty(t: Trade): number {
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
 * One trade's move in each unit, from (avg exit − avg entry) in the trade's
 * direction. Futures read it times the contracts the exits closed (Q3,
 * settled on the sample's Futures live: +8,495 ticks): as is in points, and
 * over the tick size in ticks, so points are always ticks times the tick
 * size. Forex reads it per lot over the pip of 0.0001, or 0.01 for a JPY
 * quote (pips; the reference's forex profit factor of 1.30 is per lot). R is
 * the P&L on the basis over the initial risk. A trade with no exit has no
 * price move.
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
  const contracts = future ? closedQty(t) : 1;
  return {
    r: r === undefined ? null : r,
    ticks:
      move !== null && future && instrument.tickSize > 0
        ? clean((move / instrument.tickSize) * contracts)
        : null,
    pips: move !== null && forex ? clean(move / pip) : null,
    points: move !== null && future ? clean(move * contracts) : null,
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

/** One exit fill's own values: its realization and what it alone is worth in each unit. */
export interface ExitUnits extends SizedRealization {
  units: TradeUnits;
}

/**
 * Each exit of a trade in each unit, from that exit's own realized value
 * (the final review's day rule): R is the exit's P&L on the basis over the
 * trade's initial risk; ticks and points are the exit's own move from the
 * average entry, in the trade's direction, times the contracts it closed;
 * pips are its move over a pip, per lot, so each exit carries its share of
 * the exited size. The exits of a trade add up to `tradeUnits` (to
 * `realizedUnits` while it is open). A trade booked whole at its close (no
 * fills) is one exit holding the whole trade. The days read their units
 * from these, summed per local date, so a red day cannot read +R.
 */
export function exitUnits(t: Trade, basis: PnlBasis): ExitUnits[] {
  const exits = sizedRealizations(t);
  const { instrument } = t;
  const risk =
    t.initialRisk !== undefined && t.initialRisk > 0 ? t.initialRisk : null;
  const future = instrument.assetClass === 'future';
  const forex = instrument.assetClass === 'forex';
  const pip = instrument.quoteCurrency === 'JPY' ? 0.01 : 0.0001;
  const sign = t.direction === 'long' ? 1 : -1;
  const exited = exits.reduce((n, x) => n + x.qty, 0);
  return exits.map((x) => {
    if (x.price === undefined) return { ...x, units: tradeUnits(t, basis) };
    const move = (x.price - t.avgEntry) * sign;
    const share = exitShare(x.qty, exited, exits.length);
    return {
      ...x,
      units: {
        r: risk === null ? null : (basis === 'gross' ? x.gross : x.net) / risk,
        ticks:
          future && instrument.tickSize > 0
            ? clean((move / instrument.tickSize) * x.qty)
            : null,
        pips: forex ? clean((move / pip) * share) : null,
        points: future ? clean(move * x.qty) : null,
      },
    };
  });
}

/**
 * Money per pip: the trade's gross P&L over its pips, in cents (TradeZella's
 * definition). Null when the trade has no pips value or moved zero pips.
 */
export function moneyPerPip(t: Trade): number | null {
  const pips = tradeUnits(t, 'gross').pips;
  return pips === null || pips === 0 ? null : Math.round(t.gross / pips);
}

/**
 * An open trade in each unit, over the exits booked so far: the move from its
 * average entry to the average price of its exit fills, on the contracts
 * those fills closed; R is the booked P&L over the initial risk. Null before
 * the first exit.
 */
export function realizedUnits(t: Trade, basis: PnlBasis): TradeUnits | null {
  const exits = sizedRealizations(t);
  if (exits.length === 0) return null;
  const fills = t.executions.filter(
    (e) => (e.side === 'buy') !== (t.direction === 'long'),
  );
  const qty = fills.reduce((n, e) => n + e.qty, 0);
  const avgExit =
    qty > 0 ? fills.reduce((n, e) => n + e.price * e.qty, 0) / qty : undefined;
  const booked = {
    gross: exits.reduce((n, r) => n + r.gross, 0),
    fees: exits.reduce((n, r) => n + r.fees, 0),
    net: exits.reduce((n, r) => n + r.net, 0),
  };
  const part: Trade = { ...t, ...booked };
  if (avgExit !== undefined) part.avgExit = avgExit;
  return tradeUnits(part, basis);
}
