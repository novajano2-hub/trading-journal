import { roundHalfEven, toCents } from './money';
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

interface Lot {
  qty: number;
  price: number;
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
  pnl: number; // quote-currency, per-direction signed, float until toCents
  maxPosition: number;
  openedAt: string;
  closedAt?: string;
}

function splitCost(total: number, openQty: number, qty: number): [closing: number, opening: number] {
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

  let pnl = d.pnl;
  let pnlCurrency = inst.quoteCurrency;
  if (inst.quoteCurrency !== acctCcy) {
    if (inst.baseCurrency === acctCcy && avgExit !== undefined) {
      pnl = pnl / avgExit;
      pnlCurrency = acctCcy;
    }
  }
  const gross = toCents(pnl);
  const fees = d.executions.reduce((s, e) => s + e.fees + e.commission, 0);

  const trade: Trade = {
    id: `${accountId}:${inst.symbol}:${first.id}`,
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
    net: gross - fees,
    tagIds: [],
    ruleChecks: [],
  };
  if (avgExit !== undefined) trade.avgExit = avgExit;
  if (status === 'closed' && d.closedAt !== undefined) trade.closedAt = d.closedAt;
  return trade;
}

function buildGroup(fills: Execution[], inst: Instrument, accountId: string, opts: BuildOptions): Trade[] {
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

  for (const f of fills) {
    if (draft === null) {
      open(f);
      continue;
    }
    const d: Draft = draft;
    const sign = d.direction === 'long' ? 1 : -1;
    const sameSide = (f.side === 'buy') === (d.direction === 'long');
    if (sameSide) {
      d.executions.push(f);
      d.lots.push({ qty: f.qty, price: f.price });
      d.entryQty += f.qty;
      d.entryNotional += f.qty * f.price;
      position += sign * f.qty;
      d.maxPosition = Math.max(d.maxPosition, Math.abs(position));
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
      closing = { ...f, id: `${f.id}:a`, qty: closeQty, fees: cf, commission: cc };
      opening = { ...f, id: `${f.id}:b`, qty: openQty, fees: of, commission: oc };
    }
    d.executions.push(closing);

    let remaining = closeQty;
    for (let lot = d.lots[0]; remaining > QTY_EPS && lot; lot = d.lots[0]) {
      const m = Math.min(lot.qty, remaining);
      d.pnl += (f.price - lot.price) * m * inst.pointValue * sign;
      lot.qty -= m;
      remaining -= m;
      if (lot.qty <= QTY_EPS) d.lots.shift();
    }
    d.exitQty += closeQty;
    d.exitNotional += closeQty * f.price;
    position -= sign * closeQty;

    if (Math.abs(position) <= QTY_EPS) {
      position = 0;
      d.closedAt = f.time;
      trades.push(finalize(d, inst, accountId, 'closed', opts));
      draft = null;
      if (opening) open(opening);
    }
  }

  if (draft !== null) trades.push(finalize(draft, inst, accountId, 'open', opts));
  return trades;
}

export function buildTrades(executions: readonly Execution[], opts: BuildOptions): BuildResult {
  const groups = new Map<string, Execution[]>();
  for (const e of executions) {
    const key = `${e.accountId}\u0000${e.symbol}`;
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }

  const unresolved: string[] = [];
  const all: Trade[] = [];
  for (const group of groups.values()) {
    const head = group[0];
    if (!head) continue;
    const { accountId, symbol } = head;
    const inst = opts.resolve(symbol);
    if (!inst) {
      if (!unresolved.includes(symbol)) unresolved.push(symbol);
      continue;
    }
    // Array.prototype.sort is stable: equal times keep input order.
    const sorted = [...group].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    all.push(...buildGroup(sorted, inst, accountId, opts));
  }

  all.sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
  all.forEach((t, i) => {
    t.serial = opts.startSerial + i;
  });
  return { trades: all, unresolvedSymbols: unresolved };
}
