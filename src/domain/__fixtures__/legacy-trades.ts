import { resolveInstrument } from '../instruments';
import { riskFromStop } from '../metrics/summary';
import type { Trade } from '../types';
import { makeTrade } from './trades';

/**
 * Trades in the shape every trade had before Plan 6B: one `plannedStop`, one
 * `plannedTarget`, and an `initialRisk` that is `riskFromStop` of the stop.
 * The prices, sizes and risks are the sample's own (one per asset class), and
 * the figures are what the code gave before levels existed, to the last digit:
 * Plan 6B must not move any of them (B14).
 */
export interface LegacyTrade {
  name: string;
  trade: Trade;
  /** `plannedR` before 6B. */
  plannedR: number;
  /** `rOf(trade, 'net')` before 6B. */
  realizedR: number;
}

function legacy(
  name: string,
  symbol: string,
  o: Partial<Trade> & { net: number },
  plannedR: number,
  realizedR: number,
): LegacyTrade {
  const base = makeTrade({ instrument: resolveInstrument(symbol)!, ...o });
  return {
    name,
    trade: { ...base, initialRisk: riskFromStop(base, base.plannedStop!) },
    plannedR,
    realizedR,
  };
}

export const LEGACY_TRADES: LegacyTrade[] = [
  legacy(
    'ETHUSD long',
    'ETHUSD',
    {
      net: -3100,
      avgEntry: 3292.13,
      maxPosition: 0.6,
      plannedStop: 3219.64,
      plannedTarget: 3449.57,
    },
    2.1718857773485936,
    -0.7128075419636698,
  ),
  legacy(
    'EURUSD long',
    'EURUSD',
    {
      net: 12000,
      avgEntry: 1.0748471428571427,
      maxPosition: 2.1,
      plannedStop: 1.07368,
      plannedTarget: 1.07695,
    },
    1.8017135862917777,
    0.48959608323133413,
  ),
  legacy(
    'AUDUSD short',
    'AUDUSD',
    {
      net: 9000,
      direction: 'short',
      avgEntry: 0.68574,
      maxPosition: 1.7,
      plannedStop: 0.68687,
      plannedTarget: 0.68348,
    },
    2.000000000000098,
    0.4685059864653826,
  ),
  legacy(
    'USDJPY long',
    'USDJPY',
    {
      net: -5000,
      avgEntry: 153.4678888888889,
      maxPosition: 1.8,
      plannedStop: 153.273,
      plannedTarget: 153.778,
    },
    1.5912200684149158,
    -0.21874179718260564,
  ),
  legacy(
    'GCM6 short',
    'GCM6',
    {
      net: 15000,
      direction: 'short',
      avgEntry: 2693.5,
      maxPosition: 1,
      plannedStop: 2695.5,
      plannedTarget: 2690,
    },
    1.75,
    0.75,
  ),
  legacy(
    'SPY short',
    'SPY',
    {
      net: 7777,
      direction: 'short',
      avgEntry: 600.49,
      maxPosition: 48,
      plannedStop: 602.46,
      plannedTarget: 596.64,
    },
    1.9543147208121672,
    0.8224407783417935,
  ),
];

/** `avgPlannedR` of all of them together, before 6B. */
export const LEGACY_AVG_PLANNED_R = 1.8781890254779254;
