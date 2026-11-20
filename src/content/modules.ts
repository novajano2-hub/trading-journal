export type ModuleSlug =
  | 'journal'
  | 'analytics'
  | 'strategies'
  | 'notebook'
  | 'prop-firms'
  | 'backtesting'
  | 'replay'
  | 'mentors';

export interface ModuleInfo {
  slug: ModuleSlug | 'assistant';
  name: string;
  oneLine: string;
  status: 'milestone-1' | 'in-development';
  hasPage: boolean;
}

export const MODULES: readonly ModuleInfo[] = [
  {
    slug: 'journal',
    name: 'Journal',
    oneLine: 'Every fill filed as a ticket you can review.',
    status: 'milestone-1',
    hasPage: true,
  },
  {
    slug: 'analytics',
    name: 'Analytics',
    oneLine: 'Patterns in your results, by setup, hour and rule.',
    status: 'milestone-1',
    hasPage: true,
  },
  {
    slug: 'strategies',
    name: 'Strategies',
    oneLine: 'Write your rules once, grade every trade against them.',
    status: 'milestone-1',
    hasPage: true,
  },
  {
    slug: 'notebook',
    name: 'Notebook',
    oneLine: 'Daily notes and reviews beside the trades they describe.',
    status: 'milestone-1',
    hasPage: true,
  },
  {
    slug: 'prop-firms',
    name: 'Prop firms',
    oneLine: 'Track challenge rules, drawdown and payouts.',
    status: 'milestone-1',
    hasPage: true,
  },
  {
    slug: 'backtesting',
    name: 'Backtesting',
    oneLine: 'Test a setup on history before it costs you money.',
    status: 'in-development',
    hasPage: true,
  },
  {
    slug: 'replay',
    name: 'Replay',
    oneLine: 'Step back through a trade bar by bar.',
    status: 'in-development',
    hasPage: true,
  },
  {
    slug: 'mentors',
    name: 'Mentor & Spaces',
    oneLine: 'Share a journal with a mentor or a trading room.',
    status: 'in-development',
    hasPage: true,
  },
  {
    slug: 'assistant',
    name: 'AI assistant',
    oneLine: 'Ask questions of your own trading record.',
    status: 'in-development',
    hasPage: false,
  },
];
