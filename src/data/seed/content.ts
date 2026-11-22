import type { AssetClass, StrategyIcon, StrategyTone } from '@/domain/types';
import type { CATEGORIES } from './templates';

/** The four groups every sample strategy has, in order. */
export const SEED_GROUPS = [
  ['entry', 'Entry'],
  ['exit', 'Exit'],
  ['risk', 'Risk'],
  ['management', 'Management'],
] as const;
export type SeedGroup = (typeof SEED_GROUPS)[number][0];

export interface StrategySeed {
  name: string;
  description: string;
  assetClasses: AssetClass[];
  /** The 'always' rules, in group order. */
  rules: { group: SeedGroup; text: string }[];
  /** The strategy's one 'loser' rule, in its Risk group; worded for the strategy, so no two rows read alike. */
  loserRule: string;
  checklist: string[];
  /** Name of the setup tag that goes with this strategy. */
  setupTag: string;
  icon: StrategyIcon;
  tone: StrategyTone;
}

export const STRATEGY_SEEDS: readonly StrategySeed[] = [
  {
    name: 'Opening range breakout',
    description:
      'Trade the first break of the 15-minute opening range when volume confirms it.',
    assetClasses: ['future', 'stock', 'option'],
    rules: [
      { group: 'entry', text: 'Wait for the 15-minute range to complete' },
      {
        group: 'entry',
        text: 'Enter on a close outside the range with volume above average',
      },
      {
        group: 'exit',
        text: 'Take half at 1R, trail the rest under the last swing',
      },
      { group: 'risk', text: 'Stop inside the opposite side of the range' },
      { group: 'risk', text: 'Risk no more than 0.5% of the account' },
      { group: 'management', text: 'No re-entry after two failed breaks' },
    ],
    loserRule: 'Took the loss at the stop inside the range',
    checklist: [
      'Range marked before the open',
      'Higher-timeframe trend agrees',
      'No major news in the next 30 minutes',
      'Size set from the stop',
    ],
    setupTag: 'Opening range',
    icon: 'target',
    tone: 'accent',
  },
  {
    name: 'Trend pullback',
    description:
      'Buy shallow pullbacks to the 20-period average in an established trend.',
    assetClasses: ['future', 'stock', 'forex', 'crypto', 'option'],
    rules: [
      { group: 'entry', text: 'Trend is intact on the 1-hour chart' },
      { group: 'entry', text: 'Pullback holds the 20-period average' },
      { group: 'exit', text: 'Exit at the prior swing high or low' },
      { group: 'exit', text: 'Exit if the trend structure breaks' },
      { group: 'risk', text: 'Stop beyond the pullback extreme' },
      { group: 'management', text: 'Move the stop to breakeven after 1R' },
    ],
    loserRule: 'Took the loss when the pullback extreme broke',
    checklist: [
      'Trend direction written down',
      'Pullback depth is shallow',
      'Stop and target placed before entry',
    ],
    setupTag: 'Pullback',
    icon: 'trend-up',
    tone: 'gain',
  },
  {
    name: 'Level reversal',
    description:
      'Fade an extended move into a marked daily level once momentum stalls.',
    assetClasses: ['future', 'stock', 'forex', 'crypto'],
    rules: [
      { group: 'entry', text: 'Price is at a level marked the night before' },
      {
        group: 'entry',
        text: 'Momentum stalls: a rejection candle forms first',
      },
      { group: 'exit', text: 'Target the mid-point of the prior range' },
      { group: 'risk', text: 'Stop just beyond the level' },
      { group: 'risk', text: 'Maximum two attempts per level' },
      { group: 'management', text: 'Stand aside after two losses in a row' },
    ],
    loserRule: 'Took the loss when the level failed to hold',
    checklist: [
      'Level is on the plan',
      'Rejection candle confirmed',
      'Reward is at least twice the risk',
      'Not trading against a trend day',
      'Calm, not chasing',
    ],
    setupTag: 'Reversal',
    icon: 'crosshair',
    tone: 'warn',
  },
  {
    name: 'Session momentum',
    description:
      'Join the direction the London or New York session picks after the first hour.',
    assetClasses: ['forex', 'crypto'],
    rules: [
      {
        group: 'entry',
        text: 'Session high or low breaks with a strong candle',
      },
      { group: 'exit', text: 'Exit into the next session level' },
      { group: 'exit', text: 'Flat before the session ends' },
      { group: 'risk', text: 'Stop under the breakout candle' },
      { group: 'management', text: 'Scale out a third at 1R' },
    ],
    loserRule: 'Took the loss when the momentum stalled',
    checklist: [
      'Calendar checked for high-impact news',
      'Spread is normal',
      'Stop distance fits the daily range',
    ],
    setupTag: 'Trend continuation',
    icon: 'lightning',
    tone: 'info',
  },
];

export interface TagSeed {
  name: string;
  category: keyof typeof CATEGORIES;
  description?: string;
}

export const TAG_SEEDS: readonly TagSeed[] = [
  { name: 'Opening range', category: 'setups' },
  { name: 'Pullback', category: 'setups' },
  { name: 'Reversal', category: 'setups' },
  { name: 'Trend continuation', category: 'setups' },
  {
    name: 'FOMO entry',
    category: 'mistakes',
    description: 'Entered because the move was leaving without me.',
  },
  {
    name: 'Moved stop',
    category: 'mistakes',
    description: 'Moved the stop away from price instead of taking the loss.',
  },
  {
    name: 'Oversized',
    category: 'mistakes',
    description: 'Traded more size than the stop allowed.',
  },
  {
    name: 'Early exit',
    category: 'mistakes',
    description: 'Closed a working trade before the plan said to.',
  },
  {
    name: 'Revenge trade',
    category: 'mistakes',
    description: 'Traded to win back the last loss.',
  },
  { name: 'Confident', category: 'emotions' },
  { name: 'Calm', category: 'emotions' },
  { name: 'Anxious', category: 'emotions' },
  { name: 'Frustrated', category: 'emotions' },
  { name: 'Impatient', category: 'emotions' },
  { name: 'A+ setup', category: 'custom' },
  { name: 'News day', category: 'custom' },
  { name: 'Low volume', category: 'custom' },
];
export const POSITIVE_EMOTIONS = ['Confident', 'Calm'] as const;
export const NEGATIVE_EMOTIONS = [
  'Anxious',
  'Frustrated',
  'Impatient',
] as const;
export const MISTAKE_NAMES = [
  'FOMO entry',
  'Moved stop',
  'Oversized',
  'Early exit',
  'Revenge trade',
] as const;
export const CUSTOM_NAMES = ['A+ setup', 'News day', 'Low volume'] as const;

/** Phrase banks for journal bodies. */
export const PHRASES = {
  wentWell: [
    'Waited for the setup instead of forcing the first move.',
    'Sized from the stop on every trade.',
    'Took the planned exit rather than hoping for more.',
    'Stayed out of the chop after the first hour.',
    'Cut the loser at the stop without moving it.',
    'Followed the checklist before each entry.',
    'Scaled out into strength as planned.',
    'Kept losses small and let the winner run.',
  ],
  toImprove: [
    'Entered a few seconds early, ahead of the confirmation.',
    'Chased a move after missing the first entry.',
    'Let one loss change how I sized the next trade.',
    'Skipped the checklist on a quick trade.',
    'Took profit too soon on a trade that was working.',
    'Traded through the lunch-hour chop out of boredom.',
    'Moved a stop instead of accepting the loss.',
  ],
  lessons: [
    'Patience pays: the best trades came after a long wait.',
    'The plan works when I follow it; the losses came from skipping it.',
    'Smaller size kept me calm and my decisions cleaner.',
    'One good trade is enough; stop when the edge is gone.',
    'Review the stop before the entry, not after.',
    'A flat day is a fine day if the setups were not there.',
  ],
  marketView: [
    'Overnight range was tight; expect a break after the open.',
    'Gapped higher into resistance; watching for a failed push.',
    'Trend day yesterday; looking for pullbacks to continue it.',
    'Data release mid-morning; keeping size light until it prints.',
    'Quiet tape into the holiday; being selective.',
    'Weak open after a strong close; waiting for the first level to hold.',
  ],
  planItems: [
    'Mark the prior high and low and trade only the breaks.',
    'Maximum three trades before noon.',
    'Stop trading after two losses in a row.',
    'Risk 0.5% per trade, no exceptions.',
    'No new entries in the last 30 minutes.',
    'Take the first partial at 1R.',
    'Skip the first five minutes of the session.',
  ],
  riskNotes: [
    'Daily loss limit is firm: stop at the line, no exceptions.',
    'Keeping size at half until the week turns positive.',
    'Max risk per trade unchanged; no adding to losers.',
  ],
  news: [
    'CPI at 8:30; no entries until it prints.',
    'No major releases today.',
    'Fed speaker at 10:00; keeping size light around it.',
    'Jobless claims before the open.',
    'Oil inventories mid-morning.',
  ],
  levels: [
    "Yesterday's high and low, plus the overnight range.",
    'Prior day close and the weekly open.',
    'The overnight low and the round number above it.',
    "Last week's high, marked on the daily chart.",
  ],
  weeklyFocus: [
    'Stick to one setup per session.',
    'Review every loss before the next open.',
    'Keep size steady after a winning streak.',
    'Journal the emotion next to each entry.',
    'Plan the week on Sunday, not on Monday morning.',
  ],
  thesis: [
    'Trend and the opening range agreed, so I took the break.',
    'Price rejected the daily level with a clean candle.',
    'Pullback held the average on lower volume.',
    'Momentum picked up after the first hour; joined the move.',
    'Failed breakout back inside the range; faded it.',
  ],
  execution: [
    'Entry was clean and the stop was placed before the fill.',
    'Entry was a little late; the stop had to sit wider than planned.',
    'Scaled in on the retest; average price was fine.',
    'Took a partial at the first target and trailed the rest.',
    'Held through a shakeout because the structure had not changed.',
  ],
  lessonsTrade: [
    'Would take this one again exactly the same way.',
    'Right idea, wrong size; keep to the plan.',
    'The exit was the problem, not the entry.',
    'Good process even though it lost; no change needed.',
    'The best part was waiting; repeat that.',
  ],
} as const;

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
}
const text = (t: string): TiptapNode => ({ type: 'text', text: t });
export const paragraph = (t: string): TiptapNode => ({
  type: 'paragraph',
  content: [text(t)],
});
export const heading = (t: string, level = 2): TiptapNode => ({
  type: 'heading',
  attrs: { level },
  content: [text(t)],
});
export const bullets = (items: readonly string[]): TiptapNode => ({
  type: 'bulletList',
  content: items.map((i) => ({
    type: 'listItem',
    content: [paragraph(i)],
  })),
});
export const doc = (
  ...content: TiptapNode[]
): { type: 'doc'; content: TiptapNode[] } => ({
  type: 'doc',
  content,
});
