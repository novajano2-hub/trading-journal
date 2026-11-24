import type { AssetClass } from './types';

/** The asset classes, in the order the instrument filter and breakdown read them. */
export const ASSET_CLASSES: readonly AssetClass[] = [
  'stock',
  'option',
  'future',
  'forex',
  'crypto',
  'cfd',
];

/** How each class reads as an instrument: the breakdown's row, the filter's chip. */
export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  stock: 'Stocks',
  option: 'Options',
  future: 'Futures',
  forex: 'Forex',
  crypto: 'Crypto',
  cfd: 'CFDs',
};
