import type { PnlBasis } from '@/domain/types';

export const METRIC_IDS = [
  'rule-adherence',
  'broken-rules-cost',
  'rule-kept',
  'rule-cost-broken',
  'rule-follow-rate',
  'rule-followed-pnl',
  'rule-followed-win-rate',
  'rule-followed-pf',
  'trade-rule-kept',
  'mistake-cost',
  'weekly-goal',
  'daily-loss-limit',
  'trades',
  'pnl',
  'cumulative-pnl',
  'win-rate',
  'profit-factor',
  'expectancy',
  'equity',
  'net-roi',
  'realized-r',
  'planned-r',
  'mae',
  'mfe',
  'sharpe',
  'sortino',
  'avg-daily-win-rate',
  'longest-day',
  'day-streaks',
  'trading-days',
  'green-days',
  'best-day',
  'worst-day',
  'avg-green-day',
  'avg-red-day',
  'trades-per-day',
  'fees',
  'gross-pnl',
  'net-pnl',
  'avg-win',
  'avg-loss',
  'largest-win',
  'largest-loss',
  'max-drawdown',
  'win-streak',
  'loss-streak',
  'avg-duration',
  'avg-size',
  'long-share',
  'no-stop',
  'r-expectancy',
  'avg-trade',
  'prop-profit',
  'prop-profit-funded',
  'prop-drawdown-left',
  'prop-daily-loss',
  'prop-trading-days',
  'prop-consistency',
] as const;

export type MetricId = (typeof METRIC_IDS)[number];

/** The one place metric wording lives. `{basis}` becomes "net" or "gross". */
const DEFINITIONS: Record<MetricId, { label: string; definition: string }> = {
  'rule-adherence': {
    label: 'Adherence',
    definition:
      "Rule checks kept, divided by rule checks answered, on closed trades in your filters. Unanswered checks don't count.",
  },
  'broken-rules-cost': {
    label: 'Broken rules cost',
    definition:
      'Total {basis} P&L of closed trades that broke at least one rule. A trade that broke several rules counts once.',
  },
  'rule-kept': {
    label: 'Kept',
    definition:
      'Closed trades that kept this rule, of those checked against it.',
  },
  'rule-cost-broken': {
    label: 'Cost when broken',
    definition:
      'Total {basis} P&L of closed trades that broke this rule. A trade that broke several rules counts in each, so rows can add up to more than the total.',
  },
  'rule-follow-rate': {
    label: 'Follow rate',
    definition:
      "Closed trades that kept this rule, divided by those that kept or broke it. Only trades the rule applies to count, and unanswered checks don't.",
  },
  'rule-followed-pnl': {
    label: 'P&L when followed',
    definition:
      'Total {basis} P&L of closed trades that kept this rule. Compare it with the cost when broken to see what the rule is worth.',
  },
  'rule-followed-win-rate': {
    label: 'Win rate when followed',
    definition:
      'Wins divided by wins plus losses, over the closed trades that kept this rule. Breakeven trades are left out.',
  },
  'rule-followed-pf': {
    label: 'Profit factor when followed',
    definition:
      'Total won divided by total lost, on {basis} P&L, over the closed trades that kept this rule. None yet when none of them lost.',
  },
  'trade-rule-kept': {
    label: 'Kept',
    definition: 'Whether this trade kept the rule. Click a mark to regrade it.',
  },
  'mistake-cost': {
    label: 'Cost',
    definition:
      'Total {basis} P&L of closed trades tagged with this mistake. A trade with two mistakes counts in both.',
  },
  'weekly-goal': {
    label: 'Weekly net goal',
    definition:
      'Net P&L after fees of closed trades from Monday to today, or to the end of your date range, in your timezone. Always net.',
  },
  'daily-loss-limit': {
    label: 'Daily loss limit',
    definition:
      'A day breaks the limit when its net P&L after fees falls below minus the limit. A day exactly at the limit keeps it. Always net.',
  },
  trades: {
    label: 'Trades',
    definition:
      "Closed trades in your filters. Open positions are counted apart, and aren't in the figures beside it.",
  },
  pnl: {
    label: '{Basis} P&L',
    definition:
      'Sum of {basis} P&L of closed trades in your filters. Net is after fees and commissions. Gross is before them.',
  },
  'cumulative-pnl': {
    label: 'Cumulative P&L',
    definition:
      'The running total of {basis} P&L by realization date: each period adds the {basis} P&L of the trades closed in it to everything before.',
  },
  'win-rate': {
    label: 'Win rate',
    definition:
      'Wins divided by wins plus losses. Breakeven trades, inside your breakeven range, are left out.',
  },
  'profit-factor': {
    label: 'Profit factor',
    definition:
      'Total won divided by total lost, on {basis} P&L. None yet when there are no losing trades.',
  },
  expectancy: {
    label: 'Expectancy',
    definition:
      'Win rate times average win, minus loss rate times average loss, per trade, on {basis} P&L.',
  },
  equity: {
    label: 'Equity',
    definition:
      'Starting balances of the selected accounts plus cumulative {basis} P&L, after each closed trade.',
  },
  'net-roi': {
    label: 'Net ROI',
    definition:
      'Net P&L of closed trades divided by the capital they committed (average entry times peak position times point value). Always net.',
  },
  'realized-r': {
    label: 'Realized R',
    definition:
      "The trade's {basis} P&L divided by the money it risked at its planned stop. +1R is a profit as large as that risk. None without a planned stop.",
  },
  'planned-r': {
    label: 'Planned R',
    definition:
      'The distance from entry to your planned target divided by the distance from entry to your planned stop. It needs both.',
  },
  mae: {
    label: 'MAE',
    definition:
      'Maximum adverse excursion: the worst open P&L the trade showed while it was held, so how far it went against you. Shown only when it was recorded.',
  },
  mfe: {
    label: 'MFE',
    definition:
      'Maximum favorable excursion: the best open P&L the trade showed while it was held, so how far it went for you. Shown only when it was recorded.',
  },
  sharpe: {
    label: 'Sharpe ratio',
    definition:
      'Mean daily return divided by its sample standard deviation, times the square root of 252. A day return is its net P&L over the balance at the start of that day, with a risk-free rate of zero.',
  },
  sortino: {
    label: 'Sortino ratio',
    definition:
      'Mean daily return divided by the downside deviation, the root of the average squared losing return over all days, times the square root of 252. None yet without a losing day.',
  },
  'avg-daily-win-rate': {
    label: 'Average daily win rate',
    definition:
      'For each day, wins divided by wins plus losses, then the mean over days. P&L is booked on the day of each exit, and days with no win or loss are left out.',
  },
  'longest-day': {
    label: 'Day length',
    definition:
      'Minutes from the first entry to the last exit of each day, in your timezone. Shows the longest and the average.',
  },
  'day-streaks': {
    label: 'Day streaks',
    definition:
      'Longest run of green days and of red days. A flat day, inside your breakeven range, neither extends nor breaks a run.',
  },
  'trading-days': {
    label: 'Trading days',
    definition:
      'Days with at least one trade exit. A trade is booked on the date it exits, so a trade held over two days counts on both.',
  },
  'green-days': {
    label: 'Green days',
    definition:
      'Trading days that ended in profit, outside your breakeven range, as a share of all trading days. Flat days count as trading days.',
  },
  'best-day': {
    label: 'Best day',
    definition: 'The trading day with the highest {basis} P&L.',
  },
  'worst-day': {
    label: 'Worst day',
    definition: 'The trading day with the lowest {basis} P&L.',
  },
  'avg-green-day': {
    label: 'Average green day',
    definition:
      'The mean {basis} P&L of your green days, those that ended in profit outside your breakeven range.',
  },
  'avg-red-day': {
    label: 'Average red day',
    definition:
      'The mean {basis} P&L of your red days, those that ended in loss outside your breakeven range.',
  },
  'trades-per-day': {
    label: 'Trades per day',
    definition:
      'Closed trades per trading day. A trade is booked on each date it exits, so one held over two days counts on both.',
  },
  fees: {
    label: 'Fees',
    definition:
      'Fees and commissions paid on the exits booked here. The entry fee is split across the exits of the trade.',
  },
  'gross-pnl': {
    label: 'Gross',
    definition: 'P&L before fees and commissions.',
  },
  'net-pnl': {
    label: 'Net',
    definition: 'P&L after fees and commissions.',
  },
  'avg-win': {
    label: 'Average win',
    definition:
      'Mean {basis} P&L of the winning trades. Breakeven trades, inside your breakeven range, are left out.',
  },
  'avg-loss': {
    label: 'Average loss',
    definition:
      'Mean {basis} P&L of the losing trades. Breakeven trades, inside your breakeven range, are left out.',
  },
  'largest-win': {
    label: 'Largest win',
    definition: 'The winning trade with the highest {basis} P&L.',
  },
  'largest-loss': {
    label: 'Largest loss',
    definition: 'The losing trade with the lowest {basis} P&L.',
  },
  'max-drawdown': {
    label: 'Max drawdown',
    definition:
      'The largest fall of the equity line from a peak to a later low, after each closed trade, with that fall as a share of the real balance at the peak: the equity there plus the deposits and withdrawals dated up to it. Equity starts at the starting balances of the selected accounts.',
  },
  'win-streak': {
    label: 'Longest win streak',
    definition:
      'The most winning trades in a row, in the order they closed. A breakeven trade neither extends nor breaks a run.',
  },
  'loss-streak': {
    label: 'Longest loss streak',
    definition:
      'The most losing trades in a row, in the order they closed. A breakeven trade neither extends nor breaks a run.',
  },
  'avg-duration': {
    label: 'Average duration',
    definition:
      'How long the trades were held on average, from the first entry to the last exit.',
  },
  'avg-size': {
    label: 'Average size',
    definition:
      'The mean of the largest position each trade held, in contracts or shares.',
  },
  'long-share': {
    label: 'Long share',
    definition: 'The share of these trades that were long rather than short.',
  },
  'no-stop': {
    label: 'Trades without a stop',
    definition:
      'Closed trades with no planned stop, so no risk to measure them in R against. They are left out of every R figure.',
  },
  'avg-trade': {
    label: 'Average trade',
    definition:
      'Mean {basis} P&L of every closed trade, breakevens included. Expectancy, by contrast, leaves them out.',
  },
  'r-expectancy': {
    label: 'R expectancy',
    definition:
      'Win rate times average winning R, plus loss rate times average losing R, over the decided trades that have a stop. What a trade is worth on average, in units of risk.',
  },
  // Prop firm rules read closed trades after fees, so they ignore the P&L basis.
  'prop-profit': {
    label: 'Profit target',
    definition:
      "Net P&L of the phase's closed trades since its start, against the profit target. Always net, after fees. A percentage target is read against the account's starting balance.",
  },
  'prop-profit-funded': {
    label: 'Profit since funded',
    definition:
      "Net P&L of the funded account's closed trades since its start. A funded phase has no profit target.",
  },
  'prop-drawdown-left': {
    label: 'Max drawdown left',
    definition:
      "How far the equity can fall before it touches the drawdown limit. Static: the limit is the starting balance less the allowance. Trailing: it follows the equity peak up and stops at the floor. End-of-day: it follows each day's closing peak. Closed trades, net.",
  },
  'prop-daily-loss': {
    label: 'Daily loss',
    definition:
      "Today's net P&L after fees against the daily loss limit, from the first trade of the day. A day breaks the limit when its net falls to minus the limit. A percentage limit is read against the starting balance.",
  },
  'prop-trading-days': {
    label: 'Trading days',
    definition:
      'Days with at least one closed trade, against the minimum the firm asks for. When the phase has a period, the days left count to its last day.',
  },
  'prop-consistency': {
    label: 'Consistency',
    definition:
      "The best day's net P&L as a share of the phase's profit. The rule is kept while it stays at or under the limit. It reads only once the phase is in profit.",
  },
};

export function metricDefinition(
  id: MetricId,
  basis: PnlBasis,
): { label: string; definition: string } {
  const d = DEFINITIONS[id];
  const Basis = basis === 'net' ? 'Net' : 'Gross';
  const fill = (s: string) =>
    s.replaceAll('{Basis}', Basis).replaceAll('{basis}', basis);
  return { label: fill(d.label), definition: fill(d.definition) };
}
