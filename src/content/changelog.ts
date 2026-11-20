export interface ChangelogEntry {
  title: string;
  body: string;
}

/** Date every entry below is true as of. Per-release dates are not claimed. */
export const CHANGELOG_AS_OF = '2026-11-20';

/** Every entry is a statement that is true as of CHANGELOG_AS_OF. */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    title: 'This public site',
    body: 'The Keel site is live: the landing page with a drop slot that files your own CSV into tickets, a page for each module, and pages for pricing, brokers, this changelog, and the terms and privacy drafts.',
  },
  {
    title: 'Metric definitions aligned with industry-standard journals',
    body: 'Win rate, profit factor, average win and loss, expectancy and drawdown follow the definitions journals commonly use, so the numbers Keel shows match what you would work out elsewhere from the same trades.',
  },
  {
    title: 'The trading engine',
    body: 'Keel builds trades from raw fills, works out P&L and the standard performance metrics, and checks results against prop-firm rules such as daily loss and maximum drawdown. It runs in your browser.',
  },
];
