import {
  CRYPTO_BASES,
  CRYPTO_QUOTES,
  FUTURES,
  FX_CODES,
  resolveInstrument,
} from '@/domain/instruments';
import type { AssetClass } from '@/domain/types';

export interface AssetExample {
  assetClass: AssetClass;
  /** The class as a visitor names it. */
  label: string;
  /** A symbol the registry resolves to `assetClass`. */
  symbol: string;
  /** How the symbol reads in a pill. */
  display: string;
}

const [FUTURE_ROOT = 'ES'] = Object.keys(FUTURES);
const [FX_QUOTE = 'USD', FX_BASE = 'EUR'] = [...FX_CODES];
const CRYPTO = `${CRYPTO_BASES[0]}-${CRYPTO_QUOTES[0]}`;
const OPTION = 'SPY261120C00600000'; // OCC form: SPY, 20 Nov 2026, call, 600

function optionDisplay(symbol: string): string {
  const i = resolveInstrument(symbol);
  return i?.underlying && i.strike !== undefined
    ? `${i.underlying} ${i.strike}${i.right === 'put' ? 'P' : 'C'}`
    : symbol;
}

/** One example per asset class the importer understands, from the registry's own tables. */
export const ASSET_EXAMPLES: readonly AssetExample[] = [
  {
    assetClass: 'future',
    label: 'Futures',
    symbol: `${FUTURE_ROOT}Z5`,
    display: FUTURE_ROOT,
  },
  { assetClass: 'stock', label: 'Stocks', symbol: 'AAPL', display: 'AAPL' },
  {
    assetClass: 'option',
    label: 'Options',
    symbol: OPTION,
    display: optionDisplay(OPTION),
  },
  {
    assetClass: 'forex',
    label: 'Forex',
    symbol: `${FX_BASE}/${FX_QUOTE}`,
    display: `${FX_BASE}/${FX_QUOTE}`,
  },
  { assetClass: 'crypto', label: 'Crypto', symbol: CRYPTO, display: CRYPTO },
];
