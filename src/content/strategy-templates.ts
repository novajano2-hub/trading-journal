// Keel's own strategy templates (spec 5.7, U3): six playbooks written for Keel,
// one each for stocks, futures, forex, options and crypto, and an intraday
// playbook across futures and stocks. Each has rule groups, a drawn cover and
// a few example trades. The author is always Keel.
//
// The example trades are illustrations, never the trader's: they are plain
// data here, shown labelled as examples, and nothing that counts trades (a
// strategy's figures, a summary, a report, a filter, the tracker) ever reads
// them. A copy of a template is a strategy of the trader's own, with no trades.
import type {
  AssetClass,
  Cents,
  Direction,
  RuleShowWhen,
  StrategyIcon,
} from '@/domain/types';

/**
 * One illustrative trade. `openedAt` and `closedAt` are the clock times as the
 * example reads them, without a date's zone ("2026-02-10T09:40:00"): an example
 * has no real day, so only its time of day shows. `entry` and `exit` are the
 * prices as written; `r` is the result in multiples of the risk taken.
 */
export interface ExampleTrade {
  symbol: string;
  side: Direction;
  openedAt: string;
  closedAt: string;
  net: Cents;
  r?: number;
  entry?: string;
  exit?: string;
}

export type TemplateStyle = 'swing' | 'intraday' | 'scalping';

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  styles: TemplateStyle[];
  assetClasses: AssetClass[];
  /** The icon a copy wears. */
  icon: StrategyIcon;
  groups: {
    title: string;
    rules: { text: string; showWhen: RuleShowWhen }[];
  }[];
  /** An inline SVG (viewBox 0 0 240 132) drawn in Keel's palette: no photo. */
  cover: string;
  examples: ExampleTrade[];
}

/** Every template's author line. */
export const TEMPLATE_AUTHOR = 'Keel';

export const STYLE_LABEL: Record<TemplateStyle, string> = {
  intraday: 'Day trading',
  swing: 'Swing trading',
  scalping: 'Scalping',
};
export const STYLE_ORDER: readonly TemplateStyle[] = [
  'intraday',
  'swing',
  'scalping',
];

// The cover's colours are the app's tokens with their light values to fall
// back on: on a page the drawing follows the theme, and as a standalone image
// (the copy's stored photo) the fallbacks apply.
const SUNKEN = 'var(--sunken,#f0f1f8)';
const MUTED = 'var(--muted,#4b5175)';
const FAINT = 'var(--faint,#636889)';
const LINE = 'var(--line-2,#d5d8ea)';
const ACCENT = 'var(--accent,#2b35af)';

const cover = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 132"><rect width="240" height="132" fill="${SUNKEN}"/>${body}</svg>`;

/** Short candles on a gap: a quiet base, then a box of the first range and the climb out of it. */
const COVER_GAP = cover(
  `<g stroke="${MUTED}" stroke-width="2"><path d="M30 104v-16M44 100v-14M58 102v-16M72 98v-14"/><path d="M120 54v-18M134 50v-16M148 46v-16M162 44v-14M176 40v-16M190 36v-14M204 34v-14"/></g>` +
    `<rect x="116" y="40" width="40" height="22" rx="2" fill="${ACCENT}" opacity=".14" stroke="${ACCENT}"/>` +
    `<path d="M84 92 L110 56" stroke="${FAINT}" stroke-dasharray="3 4" fill="none"/>`,
);

/** A price path that leaves a shaded band and falls back into it. */
const COVER_VALUE_AREA = cover(
  `<rect x="0" y="52" width="240" height="34" fill="${ACCENT}" opacity=".12"/>` +
    `<line x1="0" x2="240" y1="52" y2="52" stroke="${ACCENT}" stroke-dasharray="4 4"/>` +
    `<line x1="0" x2="240" y1="86" y2="86" stroke="${ACCENT}" stroke-dasharray="4 4"/>` +
    `<path d="M14 30 C40 26 56 34 74 28 S104 40 120 52 150 74 170 70 204 66 226 72" fill="none" stroke="${MUTED}" stroke-width="2"/>`,
);

/** A boxed overnight range, then a break above it. */
const COVER_RANGE_BREAK = cover(
  `<rect x="20" y="62" width="110" height="30" rx="2" fill="none" stroke="${ACCENT}"/>` +
    `<path d="M20 80 L36 72 L50 86 L66 70 L82 84 L98 68 L114 82 L130 74 L150 50 L170 56 L190 36 L216 28" fill="none" stroke="${MUTED}" stroke-width="2"/>` +
    `<line x1="130" x2="130" y1="20" y2="112" stroke="${FAINT}" stroke-dasharray="3 4"/>`,
);

/** The payoff of a debit spread: a floor, a slope, a cap. */
const COVER_SPREAD = cover(
  `<line x1="16" x2="224" y1="80" y2="80" stroke="${LINE}"/>` +
    `<path d="M16 98 H96 L148 44 H224" fill="none" stroke="${ACCENT}" stroke-width="2.5"/>` +
    `<line x1="122" x2="122" y1="24" y2="112" stroke="${FAINT}" stroke-dasharray="3 4"/>`,
);

/** A rising path with pullbacks to a dashed average, and a dot at each buy. */
const COVER_TREND = cover(
  `<path d="M14 112 C60 92 120 66 226 24" fill="none" stroke="${ACCENT}" stroke-dasharray="5 4" stroke-width="1.5"/>` +
    `<path d="M14 104 L40 86 L52 98 L80 72 L94 84 L124 56 L138 68 L170 40 L184 50 L222 20" fill="none" stroke="${MUTED}" stroke-width="2"/>` +
    `<g fill="${ACCENT}"><circle cx="52" cy="98" r="3.5"/><circle cx="94" cy="84" r="3.5"/><circle cx="138" cy="68" r="3.5"/><circle cx="184" cy="50" r="3.5"/></g>`,
);

/** A checklist: two done, one still open. */
const COVER_CHECKLIST = cover(
  `<g stroke-linecap="round"><g stroke="${ACCENT}" stroke-width="2.5" fill="none"><path d="M30 36 l6 6 l10 -12"/><path d="M30 64 l6 6 l10 -12"/></g>` +
    `<rect x="30" y="86" width="16" height="16" rx="4" fill="none" stroke="${FAINT}" stroke-width="2"/>` +
    `<g stroke="${MUTED}" stroke-width="5"><line x1="62" x2="170" y1="36" y2="36"/><line x1="62" x2="150" y1="64" y2="64"/></g>` +
    `<line x1="62" x2="190" y1="94" y2="94" stroke="${LINE}" stroke-width="5"/></g>`,
);

export const STRATEGY_TEMPLATES: readonly StrategyTemplate[] = [
  {
    id: 'gap-and-hold',
    name: 'Gap and hold',
    description:
      'Buy a stock that gaps up on news and holds above its first 30-minute range.',
    styles: ['intraday'],
    assetClasses: ['stock'],
    icon: 'rocket',
    groups: [
      {
        title: 'Setup',
        rules: [
          {
            text: 'The gap is 3% or more and has a reason you can name',
            showWhen: 'always',
          },
          {
            text: 'Premarket volume is well above what the stock usually trades',
            showWhen: 'always',
          },
          {
            text: 'Mark the high and low of the first 30 minutes',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Entry',
        rules: [
          {
            text: 'Buy only on a break above the first 30-minute high',
            showWhen: 'always',
          },
          {
            text: 'Skip it if price fills the gap before that break',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Risk',
        rules: [
          {
            text: 'Stop just under the low of the first 30 minutes',
            showWhen: 'always',
          },
          {
            text: 'Size the position so the stop costs 1R',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Exit and review',
        rules: [
          {
            text: 'Sell half at 2R and trail the rest under the last 5-minute low',
            showWhen: 'always',
          },
          {
            text: 'Flat before the close, never held overnight',
            showWhen: 'always',
          },
          {
            text: 'Stayed with the trail instead of selling the first pause',
            showWhen: 'winner',
          },
          {
            text: 'Wrote down what would have kept me out of it',
            showWhen: 'loser',
          },
        ],
      },
    ],
    cover: COVER_GAP,
    examples: [
      {
        symbol: 'NVDA',
        side: 'long',
        openedAt: '2026-03-10T09:41:00',
        closedAt: '2026-03-10T10:32:00',
        entry: '118.40',
        exit: '122.80',
        net: 40000,
        r: 2.0,
      },
      {
        symbol: 'AMD',
        side: 'long',
        openedAt: '2026-03-12T09:48:00',
        closedAt: '2026-03-12T11:05:00',
        entry: '164.10',
        exit: '166.35',
        net: 30000,
        r: 1.5,
      },
      {
        symbol: 'SHOP',
        side: 'long',
        openedAt: '2026-03-17T09:55:00',
        closedAt: '2026-03-17T10:40:00',
        entry: '91.20',
        exit: '93.40',
        net: 22000,
        r: 1.1,
      },
      {
        symbol: 'ROKU',
        side: 'long',
        openedAt: '2026-03-19T09:52:00',
        closedAt: '2026-03-19T10:15:00',
        entry: '74.60',
        exit: '72.80',
        net: -20000,
        r: -1.0,
      },
    ],
  },
  {
    id: 'value-area-return',
    name: 'Value area return',
    description:
      "Fade an open outside yesterday's value area once the first hour fails to hold it.",
    styles: ['intraday'],
    assetClasses: ['future'],
    icon: 'waves',
    groups: [
      {
        title: 'Setup',
        rules: [
          {
            text: "Mark yesterday's value area high, low and point of control",
            showWhen: 'always',
          },
          {
            text: 'Price opened outside that area, not just near its edge',
            showWhen: 'always',
          },
          {
            text: 'Note the overnight high and low as the outer limits',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Entry',
        rules: [
          {
            text: 'Wait for the first hour to finish before taking a side',
            showWhen: 'always',
          },
          {
            text: 'Enter on a retest of the area edge, coming from inside it',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Risk',
        rules: [
          {
            text: 'Stop beyond the extreme of the first hour',
            showWhen: 'always',
          },
          {
            text: 'No second attempt on the same day after a stop',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Exit and review',
        rules: [
          {
            text: 'First target is the point of control, second is the far edge',
            showWhen: 'always',
          },
          {
            text: 'Leave if price holds outside the area for two 30-minute bars',
            showWhen: 'always',
          },
          {
            text: 'Took the second target rather than closing at the first',
            showWhen: 'winner',
          },
          {
            text: 'Checked whether the open was already trending before I faded it',
            showWhen: 'loser',
          },
        ],
      },
    ],
    cover: COVER_VALUE_AREA,
    examples: [
      {
        symbol: 'ES',
        side: 'short',
        openedAt: '2026-02-03T09:45:00',
        closedAt: '2026-02-03T10:50:00',
        entry: '6,640.00',
        exit: '6,624.00',
        net: 80000,
        r: 2.0,
      },
      {
        symbol: 'NQ',
        side: 'long',
        openedAt: '2026-02-05T10:05:00',
        closedAt: '2026-02-05T11:20:00',
        entry: '22,410.00',
        exit: '22,440.00',
        net: 60000,
        r: 1.5,
      },
      {
        symbol: 'ES',
        side: 'long',
        openedAt: '2026-02-09T09:40:00',
        closedAt: '2026-02-09T10:05:00',
        entry: '6,585.25',
        exit: '6,577.25',
        net: -40000,
        r: -1.0,
      },
      {
        symbol: 'ES',
        side: 'short',
        openedAt: '2026-02-11T09:50:00',
        closedAt: '2026-02-11T11:30:00',
        entry: '6,652.00',
        exit: '6,644.00',
        net: 40000,
        r: 1.0,
      },
      {
        symbol: 'NQ',
        side: 'short',
        openedAt: '2026-02-13T10:10:00',
        closedAt: '2026-02-13T10:30:00',
        entry: '22,560.00',
        exit: '22,580.00',
        net: -40000,
        r: -1.0,
      },
    ],
  },
  {
    id: 'london-range-break',
    name: 'London range break',
    description:
      'Trade the break of the Asian session range after the London open, stop inside the range.',
    styles: ['intraday'],
    assetClasses: ['forex'],
    icon: 'clock',
    groups: [
      {
        title: 'Setup',
        rules: [
          {
            text: 'Mark the Asian session high and low before London opens',
            showWhen: 'always',
          },
          {
            text: 'Skip the pair if that range is under 20 pips or over 60',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Entry',
        rules: [
          {
            text: 'Enter on a 15-minute close outside the range',
            showWhen: 'always',
          },
          { text: 'No entry after 10:00 London time', showWhen: 'always' },
        ],
      },
      {
        title: 'Risk',
        rules: [
          {
            text: 'Stop inside the range, no more than 1R',
            showWhen: 'always',
          },
          {
            text: 'One pair at a time, and no re-entry after a stop',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Exit and review',
        rules: [
          {
            text: 'Target 2R, or close at 12:00 London time',
            showWhen: 'always',
          },
          {
            text: 'Moved the stop to the entry only after 1R, not before',
            showWhen: 'winner',
          },
          {
            text: 'Checked for a news release in the window before I entered',
            showWhen: 'loser',
          },
        ],
      },
    ],
    cover: COVER_RANGE_BREAK,
    examples: [
      {
        symbol: 'GBPUSD',
        side: 'long',
        openedAt: '2026-01-14T08:12:00',
        closedAt: '2026-01-14T09:05:00',
        entry: '1.31120',
        exit: '1.31450',
        net: 33000,
        r: 2.2,
      },
      {
        symbol: 'EURUSD',
        side: 'short',
        openedAt: '2026-01-15T08:31:00',
        closedAt: '2026-01-15T08:52:00',
        entry: '1.15610',
        exit: '1.15760',
        net: -15000,
        r: -1.0,
      },
      {
        symbol: 'EURUSD',
        side: 'long',
        openedAt: '2026-01-20T08:05:00',
        closedAt: '2026-01-20T09:40:00',
        entry: '1.15240',
        exit: '1.15540',
        net: 30000,
        r: 2.0,
      },
      {
        symbol: 'GBPUSD',
        side: 'short',
        openedAt: '2026-01-22T08:47:00',
        closedAt: '2026-01-22T09:10:00',
        entry: '1.31880',
        exit: '1.32030',
        net: -15000,
        r: -1.0,
      },
    ],
  },
  {
    id: 'defined-risk-earnings',
    name: 'Defined-risk earnings',
    description:
      'Buy a debit spread before earnings, sized so the premium paid is the most you can lose.',
    styles: ['swing'],
    assetClasses: ['option'],
    icon: 'shield',
    groups: [
      {
        title: 'Setup',
        rules: [
          {
            text: 'The report is one to five trading days away',
            showWhen: 'always',
          },
          {
            text: "The move the options price in is smaller than the stock's usual move on a report",
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Entry',
        rules: [
          {
            text: 'Buy a spread, never a single option on its own',
            showWhen: 'always',
          },
          {
            text: 'Pick strikes where the best case pays at least twice the premium',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Risk',
        rules: [
          {
            text: 'The premium paid is the most I can lose, and it is 1R',
            showWhen: 'always',
          },
          { text: 'One earnings position per stock', showWhen: 'always' },
        ],
      },
      {
        title: 'Exit and review',
        rules: [
          {
            text: 'Close the spread on the first morning after the report',
            showWhen: 'always',
          },
          { text: 'Never carry it into expiry week', showWhen: 'always' },
          {
            text: 'Took the gain instead of waiting for the cap',
            showWhen: 'winner',
          },
          {
            text: 'Wrote down what the options were pricing, and what happened',
            showWhen: 'loser',
          },
        ],
      },
    ],
    cover: COVER_SPREAD,
    examples: [
      {
        symbol: 'AAPL 190/200C',
        side: 'long',
        openedAt: '2026-04-29T15:50:00',
        closedAt: '2026-04-30T09:45:00',
        entry: '2.50',
        exit: '6.00',
        net: 35000,
        r: 1.4,
      },
      {
        symbol: 'MSFT 440/450C',
        side: 'long',
        openedAt: '2026-04-28T15:40:00',
        closedAt: '2026-04-29T09:40:00',
        entry: '2.00',
        exit: '4.60',
        net: 26000,
        r: 1.3,
      },
      {
        symbol: 'NFLX 900/920C',
        side: 'long',
        openedAt: '2026-04-15T15:55:00',
        closedAt: '2026-04-16T09:35:00',
        entry: '2.50',
        exit: '0.00',
        net: -25000,
        r: -1.0,
      },
    ],
  },
  {
    id: 'weekly-trend-pullback',
    name: 'Weekly trend pullback',
    description:
      'Buy pullbacks to the 20-day average while the weekly trend points up.',
    styles: ['swing'],
    assetClasses: ['crypto'],
    icon: 'trend-up',
    groups: [
      {
        title: 'Setup',
        rules: [
          {
            text: 'The weekly chart makes higher highs and higher lows',
            showWhen: 'always',
          },
          {
            text: 'Price has pulled back to the 20-day average, not through it',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Entry',
        rules: [
          {
            text: 'Buy once a daily candle closes back above its own open',
            showWhen: 'always',
          },
          {
            text: 'Add no more than once, and only after the first buy is in profit',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Risk',
        rules: [
          {
            text: 'Stop under the pullback low, sized to cost 1R',
            showWhen: 'always',
          },
          {
            text: 'No more than two of these open at the same time',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Exit and review',
        rules: [
          {
            text: 'Trail the stop under each higher daily low once it is above 1R',
            showWhen: 'always',
          },
          {
            text: 'Left the trail alone on the quiet days',
            showWhen: 'winner',
          },
          {
            text: 'Checked that the weekly trend was still up when I bought',
            showWhen: 'loser',
          },
        ],
      },
    ],
    cover: COVER_TREND,
    examples: [
      {
        symbol: 'BTCUSD',
        side: 'long',
        openedAt: '2026-02-03T08:00:00',
        closedAt: '2026-02-11T16:00:00',
        entry: '96,400',
        exit: '103,600',
        net: 72000,
        r: 2.4,
      },
      {
        symbol: 'ETHUSD',
        side: 'long',
        openedAt: '2026-02-12T09:00:00',
        closedAt: '2026-02-19T20:00:00',
        entry: '3,450',
        exit: '3,720',
        net: 54000,
        r: 1.8,
      },
      {
        symbol: 'SOLUSD',
        side: 'long',
        openedAt: '2026-02-17T10:00:00',
        closedAt: '2026-02-24T12:00:00',
        entry: '182.40',
        exit: '194.40',
        net: 45000,
        r: 1.5,
      },
      {
        symbol: 'ETHUSD',
        side: 'long',
        openedAt: '2026-02-26T09:00:00',
        closedAt: '2026-02-28T18:00:00',
        entry: '3,380',
        exit: '3,240',
        net: -30000,
        r: -1.0,
      },
    ],
  },
  {
    id: 'first-hour-playbook',
    name: 'First-hour playbook',
    description:
      'A checklist for the first hour: levels marked, size set, two setups only, done by 10:30.',
    styles: ['intraday', 'scalping'],
    assetClasses: ['future', 'stock'],
    icon: 'flag',
    groups: [
      {
        title: 'Before the open',
        rules: [
          {
            text: "Mark yesterday's high, low and close, and the overnight range",
            showWhen: 'always',
          },
          {
            text: 'Write the most I will lose today, and size every trade to it',
            showWhen: 'always',
          },
          {
            text: 'Check the calendar for reports in the first hour',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'During the hour',
        rules: [
          {
            text: 'Wait five minutes after the open before the first trade',
            showWhen: 'always',
          },
          {
            text: 'Take only the two setups written down for today',
            showWhen: 'always',
          },
          {
            text: 'Every trade has its stop placed before the entry',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Stop rules',
        rules: [
          { text: 'Two losers in a row ends the session', showWhen: 'always' },
          {
            text: 'Done by 10:30, whatever the result',
            showWhen: 'always',
          },
        ],
      },
      {
        title: 'Review',
        rules: [
          {
            text: 'Wrote down the one thing I did well',
            showWhen: 'winner',
          },
          {
            text: 'Named the rule I bent, or wrote that I kept them all',
            showWhen: 'loser',
          },
        ],
      },
    ],
    cover: COVER_CHECKLIST,
    examples: [
      {
        symbol: 'ES',
        side: 'long',
        openedAt: '2026-02-10T09:40:00',
        closedAt: '2026-02-10T10:12:00',
        entry: '6,601.00',
        exit: '6,609.00',
        net: 40000,
        r: 2.0,
      },
      {
        symbol: 'NQ',
        side: 'short',
        openedAt: '2026-02-10T09:52:00',
        closedAt: '2026-02-10T10:08:00',
        entry: '22,540.00',
        exit: '22,525.00',
        net: 30000,
        r: 1.5,
      },
      {
        symbol: 'AAPL',
        side: 'long',
        openedAt: '2026-02-11T09:36:00',
        closedAt: '2026-02-11T09:58:00',
        entry: '232.10',
        exit: '234.10',
        net: 20000,
        r: 1.0,
      },
      {
        symbol: 'TSLA',
        side: 'short',
        openedAt: '2026-02-12T09:44:00',
        closedAt: '2026-02-12T09:51:00',
        entry: '348.60',
        exit: '350.60',
        net: -20000,
        r: -1.0,
      },
      {
        symbol: 'ES',
        side: 'short',
        openedAt: '2026-02-13T09:47:00',
        closedAt: '2026-02-13T10:03:00',
        entry: '6,622.50',
        exit: '6,626.50',
        net: -20000,
        r: -1.0,
      },
    ],
  },
];

export function templateById(
  id: string | undefined,
): StrategyTemplate | undefined {
  return id === undefined
    ? undefined
    : STRATEGY_TEMPLATES.find((t) => t.id === id);
}

/**
 * The three figures a template's card shows, read from its example trades
 * alone: the share that won (0 to 1, over every example), how many there are,
 * and the average win over the size of the average loss (null without both a
 * win and a loss). Nothing of the trader's own enters.
 */
export function exampleStats(t: StrategyTemplate): {
  winRate: number;
  trades: number;
  winLoss: number | null;
} {
  const trades = t.examples.length;
  const wins = t.examples.filter((e) => e.net > 0);
  const losses = t.examples.filter((e) => e.net < 0);
  const mean = (xs: ExampleTrade[]): number =>
    xs.reduce((sum, e) => sum + e.net, 0) / xs.length;
  return {
    winRate: trades === 0 ? 0 : wins.length / trades,
    trades,
    winLoss:
      wins.length === 0 || losses.length === 0
        ? null
        : mean(wins) / Math.abs(mean(losses)),
  };
}
