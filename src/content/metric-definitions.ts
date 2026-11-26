import type { PnlBasis } from '@/domain/types';

export const METRIC_IDS = [
  'rule-adherence',
  'session-length',
  'broken-rules-cost',
  'rule-kept',
  'rule-cost-broken',
  'rule-follow-rate',
  'rule-followed-pnl',
  'rule-followed-win-rate',
  'rule-followed-pf',
  'trade-rule-kept',
  'mistake-cost',
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
  'volume',
  'best-month',
  'worst-month',
  'avg-month',
  'winners',
  'losers',
  'breakevens',
  'open-trades',
  'green-day-count',
  'red-day-count',
  'flat-day-count',
  'logged-days',
  'daily-drawdown',
  'account-balance',
  'balance-and-pnl',
  'current-day-streak',
  'current-trade-streak',
  'current-streaks',
  'avg-drawdown-card',
  'long-winners',
  'long-losers',
  'long-breakevens',
  'long-open-trades',
  'short-winners',
  'short-losers',
  'short-breakevens',
  'short-open-trades',
  'avg-daily-pnl',
  'avg-daily-win-loss',
  'largest-green-day',
  'largest-red-day',
  'avg-daily-volume',
  'avg-drawdown',
  'avg-drawdown-pct',
  'hold-time',
  'hold-time-wins',
  'hold-time-losses',
  'hold-time-breakevens',
  'commissions',
  'fill-fees',
  'avg-win-loss',
  'longest-trade',
  'avg-day-length',
  'long-trades',
  'short-trades',
  'long-win-rate',
  'short-win-rate',
  'daily-win-rate',
  'green-day-streak',
  'red-day-streak',
  'prop-profit',
  'prop-profit-funded',
  'prop-drawdown-left',
  'prop-daily-loss',
  'prop-trading-days',
  'prop-consistency',
  'day-ticks',
  'day-pips',
  'day-points',
  'day-rating',
  'tracker-streak',
  'tracker-score',
  'tracker-today',
  'day-trades',
  'day-gross',
  'day-won-lost',
  'day-commissions',
  'day-win-rate',
  'day-volume',
  'day-profit-factor',
  'rule-streak',
  'rule-average',
  'tracker-history',
  'tracker-card',
  'tracker-follow-rate',
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
      'Total won divided by total lost, on {basis} P&L, over the closed trades that kept this rule. None when none of them lost.',
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
      'Total won divided by total lost, on {basis} P&L. In R, ticks, pips or points, the same totals in that unit, over the trades it reads. None when there are no losing trades.',
  },
  expectancy: {
    label: 'Expectancy',
    definition:
      'Win rate times average win, minus loss rate times average loss, per trade, on {basis} P&L.',
  },
  equity: {
    label: 'Equity',
    definition:
      'Starting balances of the selected accounts plus cumulative {basis} P&L, after each closed trade. A balance has no value in R, ticks, pips or points.',
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
      'Mean daily return divided by its sample standard deviation, times the square root of 252. A day return is its net P&L over the balance at the start of that day, with a risk-free rate of zero. A return on the balance has no value in R, ticks, pips or points.',
  },
  sortino: {
    label: 'Sortino ratio',
    definition:
      'Mean daily return divided by the downside deviation, the root of the average squared losing return over all days, times the square root of 252. None without a losing day. A return on the balance has no value in R, ticks, pips or points.',
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
    label: 'Day win rate',
    definition:
      'The day win rate: trading days that ended in profit, outside your breakeven range, as a share of all trading days, shown with the green, red and flat days. Flat days count as trading days.',
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
    label: 'Commissions and fees',
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
      'Mean {basis} P&L of the winning trades, or their mean in R, ticks, pips or points when you show one. Breakeven trades, inside your breakeven range, are left out.',
  },
  'avg-loss': {
    label: 'Average loss',
    definition:
      'Mean {basis} P&L of the losing trades, or their mean in R, ticks, pips or points when you show one. Breakeven trades, inside your breakeven range, are left out.',
  },
  'largest-win': {
    label: 'Largest win',
    definition:
      'The winning trade with the highest {basis} P&L, or the most in R, ticks, pips or points when you show one.',
  },
  'largest-loss': {
    label: 'Largest loss',
    definition:
      'The losing trade with the lowest {basis} P&L, or the most lost in R, ticks, pips or points when you show one.',
  },
  'max-drawdown': {
    label: 'Max drawdown',
    definition:
      'The largest fall of the running total of your daily {basis} P&L from a peak day to a later low day, as a day-by-day line, with that fall as a share of the real balance on the peak day: the balance there plus the deposits and withdrawals dated up to it. A day books the trades by the day they exit, as the calendar does, and the line starts at the starting balances of the selected accounts. A dip within one day does not count. In R, ticks, pips or points the share has no value.',
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
  volume: {
    label: 'Volume',
    definition:
      'Contracts, lots or shares traded, each trade counted once by the quantity it opened, not by every fill. On a day, a trade counts what its exits closed that day, so a trade that exits over several days is shared among them by exited size. What an open trade still holds counts on the day it opened.',
  },
  'session-length': {
    label: 'Session',
    definition:
      "How long the day's session ran, from Start session to End session. A session left running ends at midnight. None when the day's session was never started.",
  },
  'day-rating': {
    label: 'Day rating',
    definition:
      "The average star rating of the day's rated trades. A trade that exits over several days counts on each of them; trades with no rating are left out. None when no trade of the day is rated.",
  },
  'day-ticks': {
    label: 'Ticks',
    definition:
      "The day's futures trades in ticks: each exit's move from the average entry, in the trade's direction, over the tick size, times the contracts that exit closed. A trade held over several days counts each exit on its own day. None when no futures trade exited.",
  },
  'day-pips': {
    label: 'Pips',
    definition:
      "The day's forex trades in pips, per lot: each exit's move from the average entry, in the trade's direction, over a pip (0.0001, or 0.01 for a yen quote), for its share of the size exited. A trade held over several days counts each exit on its own day. None when no forex trade exited.",
  },
  'day-points': {
    label: 'Points',
    definition:
      "The day's futures trades in points: each exit's move from the average entry, in the trade's direction, times the contracts that exit closed. A trade held over several days counts each exit on its own day. None when no futures trade exited.",
  },
  'best-month': {
    label: 'Best month',
    definition:
      'The calendar month with the highest {basis} P&L, with that month named. A trade is booked on the day it exits.',
  },
  'worst-month': {
    label: 'Lowest month',
    definition:
      'The calendar month with the lowest {basis} P&L, with that month named. With one month traded it is the best month too.',
  },
  'avg-month': {
    label: 'Average per month',
    definition:
      'The {basis} P&L of all trading days over the number of months that have a trading day. A month with no trade is not counted.',
  },
  winners: {
    label: 'Winners',
    definition:
      'Closed trades that ended in profit, outside your breakeven range.',
  },
  losers: {
    label: 'Losers',
    definition:
      'Closed trades that ended in loss, outside your breakeven range.',
  },
  breakevens: {
    label: 'Breakevens',
    definition: 'Closed trades whose result fell inside your breakeven range.',
  },
  'open-trades': {
    label: 'Open trades',
    definition:
      'Trades with no close yet. They are left out of every figure on closed trades.',
  },
  'green-day-count': {
    label: 'Green days',
    definition:
      'Trading days that ended in profit, outside your breakeven range.',
  },
  'red-day-count': {
    label: 'Red days',
    definition:
      'Trading days that ended in loss, outside your breakeven range.',
  },
  'flat-day-count': {
    label: 'Flat days',
    definition: 'Trading days whose result fell inside your breakeven range.',
  },
  'logged-days': {
    label: 'Logged days',
    definition:
      'Days in the date range that have a daily journal entry. Two entries on one day count once, and entries in the trash do not count.',
  },
  'daily-drawdown': {
    label: 'Daily drawdown',
    definition:
      'How far the close of a trading day sat under its running peak, as the {basis} P&L day by day has it: 0 on a day that closed at a new peak, below 0 otherwise. A period reads where its last trading day closed. The peak starts at the start of the date range, as 0, and rises with the best running total since. It stays in money under ticks, pips, points and R.',
  },
  'account-balance': {
    label: 'Net account balance',
    definition:
      'What the selected accounts hold at the end of the period: their balance the day before the date range starts, the deposits and withdrawals after it, and the net P&L of the trades in your filters booked up to then. It has no value in R, ticks, pips or points.',
  },
  'balance-and-pnl': {
    label: 'Account balance and P&L',
    definition:
      'What the selected accounts hold at the end of the date range, with the closed net P&L of the trades in your filters under it. The balance is the starting balances, the deposits and withdrawals, and the net P&L booked up to then. It has no value in R, ticks, pips or points.',
  },
  'current-day-streak': {
    label: 'Winning day streak',
    definition:
      'Winning days in a row, counted back from the last trading day of your date range. A losing or flat day, inside your breakeven range, ends the run, so it reads 0 after one.',
  },
  'current-trade-streak': {
    label: 'Winning trade streak',
    definition:
      'Winning trades in a row, counted back from your last closed trade, in the order they closed. A losing or breakeven trade ends the run, so it reads 0 after one.',
  },
  'current-streaks': {
    label: 'Streaks',
    definition:
      'Winning days in a row up to your last trading day, and winning trades in a row up to your last trade. A losing or breakeven day or trade ends a run.',
  },
  'avg-drawdown-card': {
    label: 'Average drawdown',
    definition:
      "How far the close of a trading day sat under its running peak, averaged over the days that closed under one. With no date range set, it shows today's drawdown from the high instead. It reads the day-by-day {basis} P&L, as the max drawdown does.",
  },
  'long-winners': {
    label: 'Long winners',
    definition:
      'Closed long trades that ended in profit, outside your breakeven range.',
  },
  'long-losers': {
    label: 'Long losers',
    definition:
      'Closed long trades that ended in loss, outside your breakeven range.',
  },
  'long-breakevens': {
    label: 'Long breakevens',
    definition:
      'Closed long trades whose result fell inside your breakeven range.',
  },
  'long-open-trades': {
    label: 'Long open trades',
    definition:
      'Long trades with no close yet, counted on the day they opened.',
  },
  'short-winners': {
    label: 'Short winners',
    definition:
      'Closed short trades that ended in profit, outside your breakeven range.',
  },
  'short-losers': {
    label: 'Short losers',
    definition:
      'Closed short trades that ended in loss, outside your breakeven range.',
  },
  'short-breakevens': {
    label: 'Short breakevens',
    definition:
      'Closed short trades whose result fell inside your breakeven range.',
  },
  'short-open-trades': {
    label: 'Short open trades',
    definition:
      'Short trades with no close yet, counted on the day they opened.',
  },
  'avg-daily-pnl': {
    label: 'Average daily P&L',
    definition: 'The mean {basis} P&L of all trading days, flat days included.',
  },
  'avg-daily-win-loss': {
    label: 'Average daily win/loss',
    definition:
      'The average green day over the size of the average red day. Above 1 means your green days are larger than your red ones. None without both a green and a red day.',
  },
  'largest-green-day': {
    label: 'Largest green day',
    definition:
      'The trading day with the most {basis} P&L won. Open the calendar on that day.',
  },
  'largest-red-day': {
    label: 'Largest red day',
    definition:
      'The trading day with the most {basis} P&L lost. Open the calendar on that day.',
  },
  'avg-daily-volume': {
    label: 'Average daily volume',
    definition:
      'Contracts, lots or shares traded over the trading days: the total volume, each trade counted once by the quantity it opened, open trades included, divided by the number of trading days.',
  },
  'avg-drawdown': {
    label: 'Average drawdown',
    definition:
      'How far the close of a trading day sat under its running peak, averaged over the days that closed under a peak. Days at a new peak are not in a drawdown, so they are not counted. The peak starts at the start of the date range, as 0, and rises with the best running total since. The line is the day-by-day {basis} P&L, as in the max drawdown.',
  },
  'avg-drawdown-pct': {
    label: 'Average drawdown %',
    definition:
      'The same days as the average drawdown, each as a share of the real balance on its peak day (the balance there plus the deposits and withdrawals dated up to it), averaged. In R, ticks, pips or points it has no value.',
  },
  'hold-time': {
    label: 'Average hold time',
    definition:
      'How long a closed trade was held on average, from its open to its close, over every closed trade.',
  },
  'hold-time-wins': {
    label: 'Winners hold time',
    definition: 'The average time from open to close of the winning trades.',
  },
  'hold-time-losses': {
    label: 'Losers hold time',
    definition: 'The average time from open to close of the losing trades.',
  },
  'hold-time-breakevens': {
    label: 'Breakevens hold time',
    definition: 'The average time from open to close of the breakeven trades.',
  },
  commissions: {
    label: 'Commissions',
    definition:
      'The total of the commissions on the fills of closed trades. A trade typed in without fills has none.',
  },
  'fill-fees': {
    label: 'Fees',
    definition:
      'The total of the exchange and regulatory fees on the fills of closed trades, apart from commissions. A trade typed in without fills counts its whole cost here.',
  },
  'avg-win-loss': {
    label: 'Average win to loss',
    definition:
      'The average winning trade over the size of the average losing trade, on {basis} P&L. Above 1 means your winners are larger than your losers. In R, ticks, pips or points, the same ratio in that unit. None without both a win and a loss.',
  },
  'longest-trade': {
    label: 'Longest trade',
    definition:
      'The longest a closed trade was held, from its open to its close.',
  },
  'avg-day-length': {
    label: 'Average day length',
    definition:
      'Minutes from the first entry to the last exit of each trading day, in your timezone, averaged over the days.',
  },
  'long-trades': {
    label: 'Long trades',
    definition: 'Closed trades that bought first.',
  },
  'short-trades': {
    label: 'Short trades',
    definition: 'Closed trades that sold first.',
  },
  'long-win-rate': {
    label: 'Long win rate',
    definition:
      'Win rate of the long trades alone: wins divided by wins plus losses, breakevens left out.',
  },
  'short-win-rate': {
    label: 'Short win rate',
    definition:
      'Win rate of the short trades alone: wins divided by wins plus losses, breakevens left out.',
  },
  'daily-win-rate': {
    label: 'Day win rate',
    definition:
      'The day win rate: trading days that ended in profit, outside your breakeven range, as a share of all trading days. Flat days count as trading days.',
  },
  'green-day-streak': {
    label: 'Longest green day streak',
    definition:
      'The most green days in a row. A flat day, inside your breakeven range, neither extends nor breaks a run.',
  },
  'red-day-streak': {
    label: 'Longest red day streak',
    definition:
      'The most red days in a row. A flat day, inside your breakeven range, neither extends nor breaks a run.',
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
  'tracker-streak': {
    label: 'Current streak',
    definition:
      "Scored days in a row on which you met every rule that applied. It counts back from today, or from yesterday while today is still open. One day that falls short ends it. Days that aren't scored, such as weekends, don't break it.",
  },
  'tracker-score': {
    label: 'Score',
    definition:
      "The average share of rules met across the scored days in the range. Each day counts the same, however many rules applied that day. Days that aren't scored are left out. It reads None until you have met a rule in the range.",
  },
  'tracker-today': {
    label: 'Today',
    definition:
      'The rules met so far today, of the rules that apply. A rule that can still be met stays pending until the day ends or you close it.',
  },
  'day-trades': {
    label: 'Trades',
    definition:
      "Every trade in the day or week, open ones included. Open trades are counted here but aren't in the figures beside it.",
  },
  'day-gross': {
    label: 'Gross P&L',
    definition:
      'P&L of the closed trades before fees and commissions. None while none has closed.',
  },
  'day-won-lost': {
    label: 'Won / lost',
    definition:
      'Closed trades that ended in profit, then in loss, outside your breakeven range. Open trades are left out.',
  },
  'day-commissions': {
    label: 'Commissions',
    definition:
      'Fees and commissions on the closed trades: gross P&L minus net P&L.',
  },
  'day-win-rate': {
    label: 'Win rate',
    definition:
      'Winners divided by winners plus losers, on closed trades. Breakeven and open trades are left out. None without a winner or a loser.',
  },
  'day-volume': {
    label: 'Volume',
    definition:
      'The quantity traded in the day or week, both sides: the buys and the sells are both counted, so a trade that opens and closes ten contracts adds twenty.',
  },
  'day-profit-factor': {
    label: 'Profit factor',
    definition:
      'Total won divided by total lost, after fees and commissions. None when no closed trade lost.',
  },
  'rule-streak': {
    label: 'Streak',
    definition:
      "Days in a row that this rule was met, counting back from today, or from yesterday while today's check is pending. A day it failed ends the run.",
  },
  'rule-average': {
    label: 'Average',
    definition:
      "This rule's own figure averaged over the scored days in the range: the share of trades kept, the day's loss, the largest loss in a trade, or the time the day note was started. None when no day has one. Money here is always net.",
  },
  'tracker-history': {
    label: 'History',
    definition:
      "Each square is a trading day, shaded by the share of rules you met that day: the darkest is every rule. Blank squares aren't scored: weekends and other non-trading days.",
  },
  'tracker-card': {
    label: 'Progress tracker',
    definition:
      'How consistently you follow your own rules. Each square is a trading day, shaded by the share of rules you met.',
  },
  'tracker-follow-rate': {
    label: 'Follow rate',
    definition:
      "The days that kept this rule, divided by the days it was decided, in the date range. A day still pending doesn't count, and a rule with no decided day reads 0%.",
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
