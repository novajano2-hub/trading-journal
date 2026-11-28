import { pnlCurrencyFor, quoteToPnl } from './currency';
import { roundHalfAway, roundHalfEven } from './money';
import type {
  CostMethod,
  Direction,
  Execution,
  Instrument,
  Trade,
} from './types';

export interface BuildOptions {
  workspaceId: string;
  startSerial: number;
  resolve: (symbol: string) => Instrument | null;
  accountCurrency: (accountId: string) => string;
  /** The account's cost method; FIFO when absent. */
  costMethodOf?: (accountId: string) => CostMethod;
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

/** Collapse the open lots into one at their quantity-weighted average price (fees and `origQty` shared pro rata). */
function collapseLots(lots: Lot[]): void {
  if (lots.length < 2) return;
  let qty = 0;
  let notional = 0;
  let fees = 0;
  let hasFees = false;
  for (const l of lots) {
    qty += l.qty;
    notional += l.qty * l.price;
    if (l.fees !== undefined) {
      hasFees = true;
      fees += (l.fees * l.qty) / (l.origQty ?? l.qty);
    }
  }
  const avg: Lot = { qty, price: notional / qty };
  if (hasFees) {
    avg.fees = fees;
    avg.origQty = qty;
  }
  lots.splice(0, lots.length, avg);
}

/**
 * Match `closeQty` against the open lots under the cost method (FIFO from the front,
 * LIFO from the back, average against one lot at the mean price), consuming them in
 * place. Returns the quote-currency P&L (signed per direction, `sign` is 1 for long
 * and -1 for short) and the pieces matched, so a caller can share per-lot figures by
 * matched quantity.
 */
export function matchLots(
  lots: Lot[],
  closeQty: number,
  exitPrice: number,
  pointValue: number,
  sign: 1 | -1,
  method: CostMethod = 'fifo',
): { pnl: number; matched: { lot: Lot; qty: number }[] } {
  if (method === 'average') collapseLots(lots);
  const fromBack = method === 'lifo';
  const next = (): Lot | undefined =>
    fromBack ? lots[lots.length - 1] : lots[0];
  let pnl = 0;
  const matched: { lot: Lot; qty: number }[] = [];
  let remaining = closeQty;
  for (let lot = next(); remaining > QTY_EPS && lot; lot = next()) {
    const m = Math.min(lot.qty, remaining);
    pnl += (exitPrice - lot.price) * m * pointValue * sign;
    matched.push({ lot, qty: m });
    lot.qty -= m;
    remaining -= m;
    if (lot.qty <= QTY_EPS) {
      if (fromBack) lots.pop();
      else lots.shift();
    }
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

/** The figures a trade derives from its executions. */
function derive(
  d: Draft,
): Pick<
  Trade,
  'avgEntry' | 'avgExit' | 'maxPosition' | 'gross' | 'fees' | 'net'
> {
  const fees = d.executions.reduce((s, e) => s + e.fees + e.commission, 0);
  // Each exit was already converted at its own rate. Round once, on the net
  // (half away from zero, as TradeZella does), then gross = net + fees.
  const net = roundHalfAway(d.pnl * 100 - fees);
  const out: ReturnType<typeof derive> = {
    avgEntry: d.entryNotional / d.entryQty,
    maxPosition: d.maxPosition,
    gross: net + fees,
    fees,
    net,
  };
  if (d.exitQty > 0) out.avgExit = d.exitNotional / d.exitQty;
  return out;
}

function finalize(
  d: Draft,
  inst: Instrument,
  accountId: string,
  status: 'open' | 'closed',
  opts: BuildOptions,
  method: CostMethod,
): Trade {
  const first = d.executions[0];
  if (!first) throw new Error('trade without executions');
  const pnlCurrency = pnlCurrencyFor(inst, opts.accountCurrency(accountId));

  const dv = derive(d);
  // The key order is part of the stored shape (the sample's hash), so keep it.
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
    avgEntry: dv.avgEntry,
    maxPosition: dv.maxPosition,
    pnlCurrency,
    gross: dv.gross,
    fees: dv.fees,
    net: dv.net,
    strategyIds: [],
    tagIds: [],
    ruleChecks: [],
  };
  if (dv.avgExit !== undefined) trade.avgExit = dv.avgExit;
  if (status === 'closed' && d.closedAt !== undefined)
    trade.closedAt = d.closedAt;
  if (method !== 'fifo') trade.costMethod = method;
  return trade;
}

/**
 * Re-run the match on a stored trade's executions under another cost method. Only the
 * figures derived from the executions change (average entry and exit, gross, fees,
 * net); every other field is kept. FIFO is stamped by omission, as `buildTrades` does.
 *
 * The executions are read leg by leg, as `buildGroup` does when it does not cut at a
 * flat point: a trade grouped by hand (Plan 6B) may return to flat and change side, and
 * each leg is matched in its own direction. A swap (also 6B) sits inside the net and
 * outside the gross (R3), so it stays in the net as it was.
 */
export function finalizeTrade(trade: Trade, method: CostMethod): Trade {
  const out: Trade = { ...trade };
  delete out.costMethod;
  if (method !== 'fifo') out.costMethod = method;
  const first = trade.executions[0];
  if (!first) return out;
  const inst = trade.instrument;
  const d: Draft = {
    direction: trade.direction,
    executions: [...trade.executions],
    lots: [],
    entryQty: 0,
    entryNotional: 0,
    exitQty: 0,
    exitNotional: 0,
    pnl: 0,
    maxPosition: 0,
    openedAt: trade.openedAt,
  };
  let position = 0;
  for (const e of trade.executions) {
    // From flat a fill opens a leg on its own side; otherwise the leg runs the way the position does.
    const leg =
      position === 0 ? (e.side === 'buy' ? 1 : -1) : position > 0 ? 1 : -1;
    if ((e.side === 'buy') === (leg === 1)) {
      d.lots.push({ qty: e.qty, price: e.price });
      d.entryQty += e.qty;
      d.entryNotional += e.qty * e.price;
      position += e.side === 'buy' ? e.qty : -e.qty;
      d.maxPosition = Math.max(d.maxPosition, Math.abs(position));
      continue;
    }
    const closeQty = Math.min(e.qty, Math.abs(position));
    const quotePnl = matchLots(
      d.lots,
      closeQty,
      e.price,
      inst.pointValue,
      leg,
      method,
    ).pnl;
    d.pnl += quoteToPnl(quotePnl, inst, trade.pnlCurrency, e.price);
    d.exitQty += closeQty;
    d.exitNotional += closeQty * e.price;
    position -= leg * closeQty;
    if (Math.abs(position) <= QTY_EPS) position = 0;
  }
  const derived = derive(d);
  delete out.avgExit;
  Object.assign(out, derived);
  // `derive` has the net of the fills alone: the swap is booked on top of it, and not on the gross.
  if (trade.swap !== undefined) out.net = derived.net + trade.swap;
  return out;
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
  const method = opts.costMethodOf?.(accountId) ?? 'fifo';
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
      method,
    ).pnl;
    d.pnl += quoteToPnl(quotePnl, inst, pnlCurrency, f.price);
    d.exitQty += closeQty;
    d.exitNotional += closeQty * f.price;
    position -= sign * closeQty;

    if (Math.abs(position) <= QTY_EPS) {
      position = 0;
      d.closedAt = f.time;
      if (cutAtFlat) {
        trades.push(finalize(d, inst, accountId, 'closed', opts, method));
        draft = null;
        if (opening) open(opening);
      } else if (opening) enter(d, opening);
    }
  }

  if (draft !== null) {
    // Only a trade that is not cut can be flat here: a cut trade ended at the flat point.
    const flat = !cutAtFlat && position === 0;
    trades.push(
      finalize(draft, inst, accountId, flat ? 'closed' : 'open', opts, method),
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
    // One at a time: a symbol with tens of thousands of trades would overflow a call's arguments (a worker's stack is smaller than the page's).
    for (const trade of buildGroup(sorted, inst, accountId, opts))
      all.push(trade);
  }

  all.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
  all.forEach((t, i) => {
    t.serial = opts.startSerial + i;
  });
  return { trades: all, unresolvedSymbols: unresolved };
}
