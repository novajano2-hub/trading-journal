import {
  Clock,
  Compass,
  Crosshair,
  Flag,
  Lightning,
  Rocket,
  Shield,
  Stack,
  Target,
  TrendDown,
  TrendUp,
  Waves,
} from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';
import type {
  AssetClass,
  RuleShowWhen,
  Strategy,
  StrategyIcon,
} from '@/domain/types';

/** The glyph of each strategy icon: the one map the list, the detail and the picker read. */
export const STRATEGY_ICON_GLYPH: Record<StrategyIcon, Icon> = {
  target: Target,
  lightning: Lightning,
  'trend-up': TrendUp,
  'trend-down': TrendDown,
  crosshair: Crosshair,
  waves: Waves,
  compass: Compass,
  flag: Flag,
  clock: Clock,
  stack: Stack,
  shield: Shield,
  rocket: Rocket,
};

export const ICON_LABEL: Record<StrategyIcon, string> = {
  target: 'Target',
  lightning: 'Lightning',
  'trend-up': 'Trend up',
  'trend-down': 'Trend down',
  crosshair: 'Crosshair',
  waves: 'Waves',
  compass: 'Compass',
  flag: 'Flag',
  clock: 'Clock',
  stack: 'Stack',
  shield: 'Shield',
  rocket: 'Rocket',
};

export const iconOf = (s: Pick<Strategy, 'icon'>): Icon =>
  STRATEGY_ICON_GLYPH[s.icon ?? 'target'];

export const ASSET_LABEL: Record<AssetClass, string> = {
  future: 'Futures',
  stock: 'Stocks',
  option: 'Options',
  forex: 'Forex',
  crypto: 'Crypto',
  cfd: 'CFDs',
};
export const ASSET_ORDER: readonly AssetClass[] = [
  'future',
  'stock',
  'option',
  'forex',
  'crypto',
  'cfd',
];

export const SHOW_WHEN_LABEL: Record<RuleShowWhen, string> = {
  always: 'Always',
  winner: 'Winner',
  loser: 'Loser',
  breakeven: 'Breakeven',
};
/** The chip a rule carries when it is not graded on every trade. */
export const SHOW_WHEN_CHIP: Record<Exclude<RuleShowWhen, 'always'>, string> = {
  winner: 'On winners',
  loser: 'On losers',
  breakeven: 'On breakevens',
};

/** A 0..1 ratio as a percentage; "None" when there is nothing to divide. */
export function pctText(x: number | null, digits = 0): string {
  return x === null ? 'None' : `${(x * 100).toFixed(digits)}%`;
}

/** The delete confirmation's sentence, for the trades that lose the strategy. */
export function deleteBody(n: number): string {
  return n === 1
    ? 'Its 1 trade keeps its data and loses this strategy.'
    : `Its ${n} trades keep their data and lose this strategy.`;
}
