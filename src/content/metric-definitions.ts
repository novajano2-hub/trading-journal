import type { PnlBasis } from '@/domain/types';

export const METRIC_IDS = [
  'rule-adherence',
  'broken-rules-cost',
  'rule-kept',
  'rule-cost-broken',
  'trade-rule-kept',
  'mistake-cost',
  'weekly-goal',
  'daily-loss-limit',
  'trades',
  'pnl',
  'win-rate',
  'profit-factor',
  'expectancy',
  'equity',
  'net-roi',
  'sharpe',
  'sortino',
  'avg-daily-win-rate',
  'longest-day',
  'day-streaks',
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
