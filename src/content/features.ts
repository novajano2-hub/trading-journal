import type { ModuleSlug } from './modules';

export interface FeatureContent {
  slug: ModuleSlug;
  headline: string;
  lede: string;
  points: { title: string; body: string }[];
}

/**
 * What each page may claim comes from the platform spec (sections 6 and 7).
 * The three in-development pages describe a planned shape, worded as plans.
 */
export const FEATURES: Record<ModuleSlug, FeatureContent> = {
  journal: {
    slug: 'journal',
    headline: 'Every fill, filed and reviewable.',
    lede: 'Bring in an export and Keel builds your trades from the fills, works out the P&L, and keeps each trade ready to review.',
    points: [
      {
        title: 'Fills become trades',
        body: 'Keel matches fills first in, first out. Scale-ins, partial exits, reversals through flat and positions still open at the end of the file are all handled.',
      },
      {
        title: 'Any CSV export',
        body: 'Map the columns once. Each row can be a fill, or a closed round trip with its entry and exit.',
      },
      {
        title: 'P&L worked out, not copied',
        body: 'Keel computes price × quantity × point value, less fees and commissions. If your file has its own P&L column it sits beside Keel’s figure, and any gap over $0.01 is flagged on the preview.',
      },
      {
        title: 'Gross or net, one switch',
        body: 'Turn fees and commissions out of every P&L figure, or leave them in.',
      },
      {
        title: 'Marked up per trade',
        body: 'Tag a setup, a mistake or an emotion. Rate the trade, check it against your rules, and link a note.',
      },
      {
        title: 'Your clock',
        body: 'Times are stored in UTC and shown in your timezone, so days and sessions line up with your day.',
      },
    ],
  },
  analytics: {
    slug: 'analytics',
    headline: 'Find the pattern in your own results.',
    lede: 'Every figure is computed from your filed trades, and every metric is defined in the app beside the number.',
    points: [
      {
        title: 'Breakeven range',
        body: 'Set a From and To in dollars or in percent, even lopsided. Trades and days inside the range count as flat, and breakevens stay out of win rate.',
      },
      {
        title: 'Expectancy',
        body: 'Win % × average win, less loss % × average loss, per trade and in R where risk is known.',
      },
      {
        title: 'Planned R and realized R',
        body: 'Planned R needs a target and a stop. Realized R needs a stop or an initial risk. They are reported separately, and trades without risk are counted as “no risk set”.',
      },
      {
        title: 'Time of day',
        body: 'Bucket results in 5, 15, 30 or 60 minutes, by entry time or by exit time.',
      },
      {
        title: 'Reports by what you did',
        body: 'Overview, plus weekday, hour, session, symbol, strategy, tag or mistake, side, duration and R distribution.',
      },
      {
        title: 'Win and loss quality',
        body: 'Profit factor, average win and loss and their ratio, largest win and loss, streaks, green days, and max drawdown in money and percent.',
      },
    ],
  },
  strategies: {
    slug: 'strategies',
    headline: 'Write your rules once. Grade every trade.',
    lede: 'A strategy is your rules in your words. Each trade gets checked against them, and the misses add up where you can see them.',
    points: [
      {
        title: 'Rules in four groups',
        body: 'Entry, exit, risk and management, each with as many rules as the setup needs.',
      },
      {
        title: 'A checklist',
        body: 'The things to confirm before you click, kept with the strategy.',
      },
      {
        title: 'Followed, broken or not checked',
        body: 'Each rule on each trade is marked followed, broken, or left blank. A blank is never counted as a pass.',
      },
      {
        title: 'Stats per strategy',
        body: 'Results for each strategy on its own, using the same definitions as the reports.',
      },
      {
        title: 'Rule adherence',
        body: 'The share of checked rules you kept, so you can set it beside your P&L.',
      },
      {
        title: 'Asset classes',
        body: 'Say whether a strategy is for stocks, options, futures, forex, crypto or CFDs.',
      },
    ],
  },
  notebook: {
    slug: 'notebook',
    headline: 'Notes beside the trades they describe.',
    lede: 'A journal of the day, kept next to the fills. Write the plan before the open and the review after the close.',
    points: [
      {
        title: 'Three templates',
        body: 'A daily review, a pre-market plan and a weekly recap, each with its own prompts.',
      },
      {
        title: 'Linked to trades',
        body: 'Attach an entry to the trades it covers, and open the note from the trade.',
      },
      {
        title: 'Free notes too',
        body: 'Not everything is a review. Write a plain note whenever you want one.',
      },
      {
        title: 'Folders',
        body: 'File entries where you will look for them.',
      },
    ],
  },
  'prop-firms': {
    slug: 'prop-firms',
    headline: 'Your challenge rules, checked after every trade.',
    lede: 'Enter the rules your firm gave you for an account. Keel measures that account’s trades against them and says how much room is left.',
    points: [
      {
        title: 'Your rules, per account',
        body: 'Profit target, daily loss limit, max drawdown, minimum trading days and an optional best-day consistency rule.',
      },
      {
        title: 'Static, EOD or Trailing',
        body: 'Pick how drawdown is measured. Daily loss can be entered in dollars or percent; percent is converted against the starting balance.',
      },
      {
        title: 'Always on net',
        body: 'The gross and net switch changes your reports, not your rules. Prop rules always use net P&L.',
      },
      {
        title: 'Active or breached',
        body: 'Each account shows its status, and a warning when a rule is near. A daily loss counts as breached at the intraday dip.',
      },
      {
        title: 'No firm presets yet',
        body: 'Keel does not ship rule sets for any firm. You type in your own, so they match your agreement.',
      },
    ],
  },
  backtesting: {
    slug: 'backtesting',
    headline: 'Test a setup before it costs you money.',
    lede: 'Backtesting is being built. The page in the app is a placeholder that shows where it will sit.',
    points: [
      {
        title: 'A session per idea',
        body: 'You would open a session for a setup and keep the trades it produces in one place.',
      },
      {
        title: 'The same reports',
        body: 'Results would read with the metrics you already use, so a test and a live record compare like for like.',
      },
      {
        title: 'Beside your strategies',
        body: 'A session would link to the strategy whose rules it tests.',
      },
    ],
  },
  replay: {
    slug: 'replay',
    headline: 'Step back through a trade, bar by bar.',
    lede: 'Replay is being built. The page in the app is a placeholder that shows where it will sit.',
    points: [
      {
        title: 'One trade at a time',
        body: 'You would open a filed trade and move through it a bar at a time.',
      },
      {
        title: 'Your entry and exit marked',
        body: 'Your fills would be marked on the way through.',
      },
      {
        title: 'Notes as you go',
        body: 'What you notice would be saved with the trade in your journal.',
      },
    ],
  },
  mentors: {
    slug: 'mentors',
    headline: 'Share a journal with a mentor, or a room.',
    lede: 'Mentor and Spaces are being built. The page in the app is a placeholder that shows where they will sit.',
    points: [
      {
        title: 'Share with a mentor',
        body: 'You would invite one person to look over a journal.',
      },
      {
        title: 'A space for a trading room',
        body: 'A group would get a shared place for its members’ journals.',
      },
      {
        title: 'You choose what is shared',
        body: 'Sharing would be something you switch on and off, not a default.',
      },
    ],
  },
};
