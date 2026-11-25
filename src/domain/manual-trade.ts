import type { ManualTradeInput } from '@/data/repository';
import {
  CRYPTO_BASES,
  CRYPTO_QUOTES,
  FUTURES,
  instrumentKey,
  resolveInstrument,
} from './instruments';
import { copySide, sidesOf, tradeRisk } from './risk';
import { buildTrades, canonicalSymbol } from './trade-builder';
import type { Instrument, LevelSide, Trade } from './types';

export type ManualTradeError =
  'no-fills' | 'reversal' | 'option-fields' | 'multiplier' | 'bad-fill';

export type AssetType =
  'stock' | 'option' | 'future' | 'future-option' | 'forex' | 'crypto' | 'cfd';

export const ASSET_TYPES: { id: AssetType; label: string }[] = [
  { id: 'stock', label: 'Stock' },
  { id: 'option', label: 'Option' },
  { id: 'future', label: 'Future' },
  { id: 'future-option', label: 'Future option' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'cfd', label: 'CFD' },
];

export const FOREX_LOT = 100000;
export const OPTION_MULTIPLIER = 100;
const DEFAULT_TICK = 0.01;

/** What the form knows about the instrument; the builder turns it into an Instrument. */
export interface InstrumentSpec {
  type: AssetType;
  /** The ticker, the underlying or the futures root, as typed. */
  symbol: string;
  expiry?: string /* YYYY-MM-DD */;
  strike?: number;
  right?: 'call' | 'put';
  /** The contract multiplier; blank where it has a default. */
  multiplier?: number;
  tickSize?: number;
  /** For a CFD or an unlisted pair: default USD. */
  quoteCurrency?: string;
}

/** The OCC symbol of an option (AAPL261218P00200000), or the bare underlying while its fields are missing. */
function optionSymbol(
  underlying: string,
  expiry: string | undefined,
  strike: number | undefined,
  right: 'call' | 'put' | undefined,
): string {
  if (!expiry || !strike || strike <= 0 || !right) return underlying;
  const [y = '', m = '', d = ''] = expiry.split('-');
  const mills = String(Math.round(strike * 1000)).padStart(8, '0');
  return `${underlying}${y.slice(2)}${m}${d}${right === 'call' ? 'C' : 'P'}${mills}`;
}

/** The contract multiplier a type starts from for this symbol; 0 where the trader must supply one. */
export function defaultMultiplier(type: AssetType, symbol: string): number {
  const s = canonicalSymbol(symbol);
  switch (type) {
    case 'option':
      return OPTION_MULTIPLIER;
    case 'forex':
      return FOREX_LOT;
    case 'stock':
    case 'crypto':
      return 1;
    case 'future':
    case 'future-option':
      return FUTURES[type === 'future' ? instrumentKey(s) : s]?.pointValue ?? 0;
    case 'cfd':
      return 0;
  }
}

/** The tick size a type starts from for this symbol. */
export function defaultTickSize(type: AssetType, symbol: string): number {
  const s = canonicalSymbol(symbol);
  if (type === 'future')
    return FUTURES[instrumentKey(s)]?.tickSize ?? DEFAULT_TICK;
  if (type === 'future-option') return FUTURES[s]?.tickSize ?? DEFAULT_TICK;
  return DEFAULT_TICK;
}

/**
 * The instrument a form entry describes. A missing multiplier on a type with
 * no default becomes 0, which `buildManualTrade` refuses; missing option
 * fields are left off, which it refuses too.
 */
export function manualInstrument(spec: InstrumentSpec): Instrument {
  const symbol = canonicalSymbol(spec.symbol);
  const quote = spec.quoteCurrency ?? 'USD';
  const multiplier = spec.multiplier ?? defaultMultiplier(spec.type, symbol);
  const tick = spec.tickSize ?? defaultTickSize(spec.type, symbol);

  switch (spec.type) {
    case 'option':
    case 'future-option': {
      const inst: Instrument = {
        symbol: optionSymbol(symbol, spec.expiry, spec.strike, spec.right),
        root: symbol,
        assetClass: 'option',
        pointValue: multiplier,
        tickSize: tick,
        quoteCurrency: quote,
        underlying: symbol,
        optionOn: spec.type === 'future-option' ? 'future' : 'stock',
      };
      if (spec.expiry) inst.expiry = spec.expiry;
      if (spec.strike !== undefined && spec.strike > 0)
        inst.strike = spec.strike;
      if (spec.right) inst.right = spec.right;
      return inst;
    }
    case 'future': {
      const known = resolveInstrument(symbol);
      const root =
        known?.assetClass === 'future' ? known.root : instrumentKey(symbol);
      return {
        symbol,
        root,
        assetClass: 'future',
        pointValue: multiplier,
        tickSize: spec.tickSize ?? FUTURES[root]?.tickSize ?? DEFAULT_TICK,
        quoteCurrency: 'USD',
        ...(known?.baseCurrency ? { baseCurrency: known.baseCurrency } : {}),
      };
    }
    case 'forex': {
      const known = resolveInstrument(symbol);
      if (known?.assetClass === 'forex') return known;
      const pair = /^([A-Z]{3})\/?([A-Z]{3})$/.exec(symbol);
      const [, base = symbol, q = quote] = pair ?? [];
      return {
        symbol,
        root: base + q,
        assetClass: 'forex',
        pointValue: FOREX_LOT,
        tickSize: q === 'JPY' ? 0.001 : 0.00001,
        quoteCurrency: q,
        baseCurrency: base,
      };
    }
    case 'crypto': {
      const known = resolveInstrument(symbol);
      if (known?.assetClass === 'crypto')
        return { ...known, pointValue: multiplier };
      return {
        symbol,
        root: symbol,
        assetClass: 'crypto',
        pointValue: multiplier,
        tickSize: tick,
        quoteCurrency: quote,
      };
    }
    case 'cfd':
      return {
        symbol,
        root: symbol,
        assetClass: 'cfd',
        pointValue: multiplier,
        tickSize: spec.tickSize ?? DEFAULT_TICK,
        quoteCurrency: quote,
      };
    case 'stock':
      return {
        symbol,
        root: symbol,
        assetClass: 'stock',
        pointValue: multiplier,
        tickSize: DEFAULT_TICK,
        quoteCurrency: quote,
      };
  }
}

/** The form's asset type for a stored instrument (`optionOn` says what an option is on; without it, an option on a futures root, or one not worth 100, is a future option). */
export function assetTypeOf(inst: Instrument): AssetType {
  if (inst.assetClass !== 'option') return inst.assetClass;
  if (inst.optionOn !== undefined)
    return inst.optionOn === 'future' ? 'future-option' : 'option';
  const root = inst.underlying ?? inst.root;
  return FUTURES[root] || inst.pointValue !== OPTION_MULTIPLIER
    ? 'future-option'
    : 'option';
}

const FOREX_PAIRS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'USD/CHF',
  'USD/CAD',
  'AUD/USD',
  'NZD/USD',
  'EUR/GBP',
  'EUR/JPY',
  'GBP/JPY',
  'AUD/JPY',
  'EUR/CHF',
];

/** Autocomplete entries for the symbol field, from the registries `resolveInstrument` reads. */
export function symbolSuggestions(type: AssetType): string[] {
  switch (type) {
    case 'future':
    case 'future-option':
      return Object.keys(FUTURES);
    case 'forex':
      return FOREX_PAIRS;
    case 'crypto':
      return CRYPTO_BASES.flatMap((b) => CRYPTO_QUOTES.map((q) => `${b}/${q}`));
    default:
      return [];
  }
}

/** What is missing from the instrument itself, whatever the fills are. */
export function instrumentProblems(
  inst: Instrument,
): ('option-fields' | 'multiplier')[] {
  const out: ('option-fields' | 'multiplier')[] = [];
  if (
    inst.assetClass === 'option' &&
    (!inst.expiry ||
      !(inst.strike !== undefined && inst.strike > 0) ||
      !inst.right)
  )
    out.push('option-fields');
  if (!(inst.pointValue > 0) || !Number.isFinite(inst.pointValue))
    out.push('multiplier');
  return out;
}

/**
 * The trade a manual entry makes, or the first reason it cannot be one. The
 * fills must form one position, opened and (maybe) closed once: a re-entry or
 * a flip is two trades, so it is refused.
 */
export function buildManualTrade(
  input: ManualTradeInput,
  ctx: {
    workspaceId: string;
    serial: number;
    accountCurrency: string;
    id?: string;
  },
):
  | { ok: true; trade: Trade }
  | { ok: false; error: ManualTradeError; fillIndex?: number } {
  const { instrument: inst, fills } = input;
  if (fills.length === 0) return { ok: false, error: 'no-fills' };
  const bad = fills.findIndex(
    (f) =>
      !(f.qty > 0) ||
      !(f.price > 0) ||
      !Number.isFinite(f.qty) ||
      !Number.isFinite(f.price) ||
      Number.isNaN(Date.parse(f.time)),
  );
  if (bad >= 0) return { ok: false, error: 'bad-fill', fillIndex: bad };
  const [problem] = instrumentProblems(inst);
  if (problem) return { ok: false, error: problem };

  const id =
    ctx.id ??
    `manual:${input.accountId}:${canonicalSymbol(inst.symbol)}:${ctx.serial}`;
  const result = buildTrades(
    fills.map((f, i) => ({
      id: `${id}:${i + 1}`,
      accountId: input.accountId,
      symbol: inst.symbol,
      side: f.side,
      qty: f.qty,
      price: f.price,
      time: f.time,
      fees: f.fees,
      commission: f.commission,
    })),
    {
      workspaceId: ctx.workspaceId,
      startSerial: ctx.serial,
      resolve: () => inst,
      accountCurrency: () => ctx.accountCurrency,
    },
  );
  const [trade, ...rest] = result.trades;
  if (!trade || rest.length > 0) return { ok: false, error: 'reversal' };

  trade.id = id;
  trade.source = 'manual';
  // The form's one stop and one target are one Price level each, at the full
  // size (B14); the risk is the stop side's loss, as everywhere else.
  if (input.plannedStop !== undefined)
    trade.stops = onePriceLevel(input.plannedStop, trade.maxPosition);
  if (input.plannedTarget !== undefined)
    trade.targets = onePriceLevel(input.plannedTarget, trade.maxPosition);
  const risk = tradeRisk(trade);
  if (risk !== undefined) trade.initialRisk = risk;
  return { ok: true, trade };
}

function onePriceLevel(value: number, qty: number): LevelSide {
  return { unit: 'price', levels: [{ value, qty }] };
}

/**
 * The price the manual form shows for a side: a side that is one Price level.
 * Any other side (several levels, or another unit) is not one the form can
 * show or edit; the trade page owns those.
 */
export function formPriceOf(side: LevelSide | undefined): number | undefined {
  const [only, ...rest] = side?.levels ?? [];
  return side?.unit === 'price' && only !== undefined && rest.length === 0
    ? only.value
    : undefined;
}

/**
 * A rebuilt manual trade with the sides of the stored one that the form could
 * not show, which it therefore could not have changed: kept as they were, with
 * the risk following them. A side the form did show follows the form, even
 * when its box was emptied. A stop or target typed into the form replaces a
 * hidden side.
 */
export function keepHiddenSides(
  built: Trade,
  old: Trade,
  input: ManualTradeInput,
): Trade {
  const before = sidesOf(old);
  const hidden = (side: LevelSide | undefined, typed: number | undefined) =>
    side !== undefined && formPriceOf(side) === undefined && typed === undefined
      ? side
      : undefined;
  const stops = hidden(before.stops, input.plannedStop);
  const targets = hidden(before.targets, input.plannedTarget);
  if (!stops && !targets) return built;
  const next: Trade = { ...built };
  if (stops) next.stops = copySide(stops);
  if (targets) next.targets = copySide(targets);
  const risk = tradeRisk(next);
  if (risk === undefined) delete next.initialRisk;
  else next.initialRisk = risk;
  return next;
}
