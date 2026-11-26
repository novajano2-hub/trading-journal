import { pnlCurrencyFor, quoteToPnl } from './currency';
import { roundHalfAway, roundHalfEven } from './money';
import type { Direction, Execution, Instrument, Trade } from './types';

export interface BuildOptions {
  workspaceId: string;
  startSerial: number;
  resolve: (symbol: string) => Instrument | null;
  accountCurrency: (accountId: string) => string;
}
export interface BuildResult {
  trades: Trade[];
  unresolvedSymbols: string[];
}

const QTY_EPS = 1e-9;

export interface Lot {
  qty: number;
  price: number;
  /** Set by callers that need each entry's own cost and starting size (realized P&L by exit). */
  fees?: number;
  origQty?: number;
}

/**
 * FIFO-match `closeQty` against the open lots, consuming them in place. Returns the
 * quote-currency P&L (signed per direction, `sign` is 1 for long and -1 for short)
 * and the pieces matched, so a caller can share per-lot figures by matched quantity.
 */
export function matchLots(
  lots: Lot[],
  closeQty: number,
  exitPrice: number,
  pointValue: number,
  sign: 1 | -1,
): { pnl: number; matched: { lot: Lot; qty: number }[] } {
  let pnl = 0;
  const matched: { lot: Lot; qty: number }[] = [];
  let remaining = closeQty;
  for (let lot = lots[0]; remaining > QTY_EPS && lot; lot = lots[0]) {
    const m = Math.min(lot.qty, remaining);
    pnl += (exitPrice - lot.price) * m * pointValue * sign;
    matched.push({ lot, qty: m });
    lot.qty -= m;
    remaining -= m;
    if (lot.qty <= QTY_EPS) lots.shift();
  }
  return { pnl, matched };
}

/** Mutable accumulator for the trade currently in progress. */
interface Draft {
  direction: Direction;
  executions: Execution[];
  lots: Lot[];
  entryQty: number;
  entryNotional: number;
  exitQty: number;
  exitNotional: number;
  pnl: number; // P&L-currency, per-direction signed, each exit converted at its own rate, float until the trade's net is rounded
  maxPosition: number;
  openedAt: string;
  closedAt?: string;
}

/** Trimmed, uppercase, no leading '/'. */
export function canonicalSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/^\/+/, '');
}

function splitCost(
  total: number,
  openQty: number,
  qty: number,
): [closing: number, opening: number] {
  const opening = roundHalfEven((total * openQty) / qty);
  return [total - opening, opening];
}

function finalize(
  d: Draft,
  inst: Instrument,
  accountId: string,
  status: 'open' | 'closed',
  opts: BuildOptions,
): Trade {
  const first = d.executions[0];
  if (!first) throw new Error('trade without executions');
  const avgEntry = d.entryNotional / d.entryQty;
  const avgExit = d.exitQty > 0 ? d.exitNotional / d.exitQty : undefined;
  const acctCcy = opts.accountCurrency(accountId);

  const pnlCurrency = pnlCurrencyFor(inst, acctCcy);
  const fees = d.executions.reduce((s, e) => s + e.fees + e.commission, 0);
  // Each exit was already converted at its own rate. Round once, on the net
  // (half away from zero, as TradeZella does), then gross = net + fees.
  const net = roundHalfAway(d.pnl * 100 - fees);
  const gross = net + fees;

  const trade: Trade = {
    id: `${accountId}:${canonicalSymbol(inst.symbol)}:${first.id}`,
    serial: 0,
    workspaceId: opts.workspaceId,
    accountId,
    instrument: inst,
    direction: d.direction,
    status,
    openedAt: d.openedAt,
    executions: d.executions,
    avgEntry,
    maxPosition: d.maxPosition,
    pnlCurrency,
    gross,
    fees,
    net,
    strategyIds: [],
    tagIds: [],
    ruleChecks: [],
  };
  if (avgExit !== undefined) trade.avgExit = avgExit;
  if (status === 'closed' && d.closedAt !== undefined)
    trade.closedAt = d.closedAt;
  return trade;
}

/**
 * The trades one account makes in one instrument from its fills, which must be
 * in time order. The position's every return to flat ends a trade, unless
 * `cutAtFlat` is off: then the fills are one trade whatever the position does
 * (the hand-made grouping of `grouping.ts`), open if it does not end flat. A
 * trade of several legs keeps the direction of its first fill; each leg's
 * P&L is still read in its own direction.
 */
export function buildGroup(
  fills: Execution[],
  inst: Instrument,
  accountId: string,
  opts: BuildOptions,
  cutAtFlat = true,
): Trade[] {
  const pnlCurrency = pnlCurrencyFor(inst, opts.accountCurrency(accountId));
  const trades: Trade[] = [];
  let position = 0; // signed
  let draft: Draft | null = null;

  const open = (e: Execution): void => {
    const direction: Direction = e.side === 'buy' ? 'long' : 'short';
    draft = {
      direction,
      executions: [e],
      lots: [{ qty: e.qty, price: e.price }],
      entryQty: e.qty,
      entryNotional: e.qty * e.price,
      exitQty: 0,
      exitNotional: 0,
      pnl: 0,
      maxPosition: e.qty,
      openedAt: e.time,
    };
    position = direction === 'long' ? e.qty : -e.qty;
  };

  // An entry: it adds to the position the fills so far hold, or, from flat, opens a leg.
  const enter = (d: Draft, e: Execution): void => {
    d.executions.push(e);
    d.lots.push({ qty: e.qty, price: e.price });
    d.entryQty += e.qty;
    d.entryNotional += e.qty * e.price;
    position += e.side === 'buy' ? e.qty : -e.qty;
    d.maxPosition = Math.max(d.maxPosition, Math.abs(position));
  };

  for (const f of fills) {
    if (draft === null) {
      open(f);
      continue;
    }
    const d: Draft = draft;
    // Flat inside a trade only happens when the trade is not cut there.
    if (position === 0) {
      enter(d, f);
      continue;
    }
    // The leg's direction, which a trade of several legs does not keep in `d.direction`.
    const sign = position > 0 ? 1 : -1;
    if ((f.side === 'buy') === (sign === 1)) {
      enter(d, f);
      continue;
    }

    // Opposite side: close FIFO, possibly crossing through zero.
    const held = Math.abs(position);
    const closeQty = Math.min(f.qty, held);
    const openQty = f.qty - closeQty;
    let closing = f;
    let opening: Execution | null = null;
    if (openQty > QTY_EPS) {
      const [cf, of] = splitCost(f.fees, openQty, f.qty);
      const [cc, oc] = splitCost(f.commission, openQty, f.qty);
      closing = {
        ...f,
        id: `${f.id}:a`,
        qty: closeQty,
        fees: cf,
        commission: cc,
      };
      opening = {
        ...f,
        id: `${f.id}:b`,
        qty: openQty,
        fees: of,
        commission: oc,
      };
    }
    d.executions.push(closing);

    const quotePnl = matchLots(
      d.lots,
      closeQty,
      f.price,
      inst.pointValue,
      sign,
    ).pnl;
    d.pnl += quoteToPnl(quotePnl, inst, pnlCurrency, f.price);
    d.exitQty += closeQty;
    d.exitNotional += closeQty * f.price;
    position -= sign * closeQty;

    if (Math.abs(position) <= QTY_EPS) {
      position = 0;
      d.closedAt = f.time;
      if (cutAtFlat) {
        trades.push(finalize(d, inst, accountId, 'closed', opts));
        draft = null;
        if (opening) open(opening);
      } else if (opening) enter(d, opening);
    }
  }

  if (draft !== null) {
    // Only a trade that is not cut can be flat here: a cut trade ended at the flat point.
    const flat = !cutAtFlat && position === 0;
    trades.push(
      finalize(draft, inst, accountId, flat ? 'closed' : 'open', opts),
    );
  }
  return trades;
}

export function buildTrades(
  executions: readonly Execution[],
  opts: BuildOptions,
): BuildResult {
  const groups = new Map<string, Execution[]>();
  for (const e of executions) {
    const key = `${e.accountId}\u0000${canonicalSymbol(e.symbol)}`;
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }

  const unresolved: string[] = [];
  const all: Trade[] = [];
  for (const group of groups.values()) {
    const head = group[0];
    if (!head) continue;
    const accountId = head.accountId;
    const symbol = canonicalSymbol(head.symbol);
    const inst = opts.resolve(symbol);
    if (!inst) {
      if (!unresolved.includes(symbol)) unresolved.push(symbol);
      continue;
    }
    // Array.prototype.sort is stable: equal times keep input order.
    const sorted = [...group].sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time),
    );
    all.push(...buildGroup(sorted, inst, accountId, opts));
  }

  all.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
  all.forEach((t, i) => {
    t.serial = opts.startSerial + i;
  });
  return { trades: all, unresolvedSymbols: unresolved };
}
