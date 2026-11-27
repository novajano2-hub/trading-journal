import { quoteToPnl } from '../currency';
import { roundHalfAway, roundHalfEven } from '../money';
import { matchLots, type Lot } from '../trade-builder';
import type { Cents, Trade } from '../types';

/** One exit fill's realized P&L, booked at the fill's own time. */
export interface Realization {
  tradeId: string;
  time: string;
  gross: Cents;
  fees: Cents;
  net: Cents;
}

/**
 * One exit's share of the trade's exited size, for splitting a per-trade
 * figure among its exit days. A quantity that is not finite or is zero cannot
 * be weighed, so the trade splits equally across its `count` exits instead of
 * crediting the whole amount to each.
 */
export function exitShare(qty: number, total: number, count: number): number {
  return Number.isFinite(total) && total > 0 && Number.isFinite(qty)
    ? qty / total
    : 1 / Math.max(1, count);
}

/** A realization with the quantity it exited, for sharing per-trade figures by size (infinite for a trade booked whole at its close). */
export interface SizedRealization extends Realization {
  qty: number;
  /** The exit fill's price; absent for a trade booked whole at its close. */
  price?: number;
}

/**
 * Every exit fill of the trade so far, including the partial exits of an open trade.
 * Entry fees are shared among the exits by matched quantity (the cents left over go
 * to the last exit of a closed trade), so the realizations of a closed trade add up
 * to its gross, fees and net. A closed trade without fills books once at its close.
 */
export function sizedRealizations(trade: Trade): SizedRealization[] {
  const sign = trade.direction === 'long' ? 1 : -1;
  const lots: Lot[] = [];
  const exits: {
    time: string;
    qty: number;
    price: number;
    /** In the trade's P&L currency, converted at this exit's own price, unrounded. */
    pnl: number;
    ownFees: number;
    entryFees: number;
  }[] = [];

  for (const e of trade.executions) {
    if ((e.side === 'buy') === (trade.direction === 'long')) {
      lots.push({
        qty: e.qty,
        price: e.price,
        fees: e.fees + e.commission,
        origQty: e.qty,
      });
      continue;
    }
    const { pnl, matched } = matchLots(
      lots,
      e.qty,
      e.price,
      trade.instrument.pointValue,
      sign,
      trade.costMethod ?? 'fifo',
    );
    const entryFees = matched.reduce(
      (s, m) => s + ((m.lot.fees ?? 0) * m.qty) / (m.lot.origQty ?? m.qty),
      0,
    );
    exits.push({
      time: e.time,
      qty: e.qty,
      price: e.price,
      pnl: quoteToPnl(pnl, trade.instrument, trade.pnlCurrency, e.price),
      ownFees: e.fees + e.commission,
      entryFees,
    });
  }

  if (exits.length === 0) {
    if (trade.status !== 'closed' || trade.closedAt === undefined) return [];
    return [
      {
        tradeId: trade.id,
        time: trade.closedAt,
        gross: trade.gross,
        fees: trade.fees,
        net: trade.net,
        qty: Number.POSITIVE_INFINITY,
      },
    ];
  }

  const closed = trade.status === 'closed';
  let grossLeft = trade.gross;
  let feesLeft = trade.fees;
  return exits.map((x, i) => {
    const last = closed && i === exits.length - 1;
    const gross = last ? grossLeft : roundHalfAway(x.pnl * 100);
    const fees = last ? feesLeft : x.ownFees + roundHalfEven(x.entryFees);
    grossLeft -= gross;
    feesLeft -= fees;
    return {
      tradeId: trade.id,
      time: x.time,
      gross,
      fees,
      net: gross - fees,
      qty: x.qty,
      price: x.price,
    };
  });
}

export function realizations(trade: Trade): Realization[] {
  return sizedRealizations(trade).map((r) => ({
    tradeId: r.tradeId,
    time: r.time,
    gross: r.gross,
    fees: r.fees,
    net: r.net,
  }));
}
