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
    body: 'The Keel site: the landing page with a drop slot that reads your own CSV into tickets, a page for each module, and pages for pricing, brokers, this changelog, and the terms and privacy drafts.',
  },
  {
    title: 'Written-down metric definitions',
    body: 'Expectancy, the breakeven range, the gross/net switch and planned vs realized R follow published trading-journal definitions. The remaining definitions are Keel’s own, and they are written down so they can be checked.',
  },
  {
    title: 'The trading engine',
    body: 'Keel builds trades from raw fills, works out P&L and the standard performance metrics, and checks results against prop-firm rules such as daily loss and drawdown limits. The engine runs when the site is built; files you drop do not reach it yet.',
  },
];
