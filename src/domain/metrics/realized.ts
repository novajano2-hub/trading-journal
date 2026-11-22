import { quoteToPnl } from '../currency';
import { roundHalfEven, toCents } from '../money';
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

/** A realization with the quantity it exited, for sharing per-trade figures by size (infinite for a trade booked whole at its close). */
export interface SizedRealization extends Realization {
  qty: number;
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
    );
    const entryFees = matched.reduce(
      (s, m) => s + ((m.lot.fees ?? 0) * m.qty) / (m.lot.origQty ?? m.qty),
      0,
    );
    exits.push({
      time: e.time,
      qty: e.qty,
      pnl,
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

  const rate = trade.avgExit ?? trade.avgEntry;
  const grossOf = (pnl: number) =>
    toCents(quoteToPnl(pnl, trade.instrument, trade.pnlCurrency, rate));
  const closed = trade.status === 'closed';
  let grossLeft = trade.gross;
  let feesLeft = trade.fees;
  return exits.map((x, i) => {
    const last = closed && i === exits.length - 1;
    const gross = last ? grossLeft : grossOf(x.pnl);
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
