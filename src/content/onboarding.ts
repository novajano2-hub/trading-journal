/*
 * The first run's survey: six steps, in Keel's own words (comps 10 to 12). The
 * answers are stored only and change nothing else (U2). Single choice on steps
 * 1, 3 and 6; several at once on 2, 4 and 5 [plan6a-behaviour 4.2].
 */

export interface Choice {
  id: string;
  label: string;
  /** A line under the label (the goals). */
  line?: string;
}

export const SURVEY_SECTION = 'About your trading';

export const EXPERIENCE: readonly Choice[] = [
  { id: 'under-1', label: 'Less than a year' },
  { id: '1-3', label: '1 to 3 years' },
  { id: '3-5', label: '3 to 5 years' },
  { id: '5-plus', label: 'More than 5 years' },
];

/** K47: "not yet" and the other two clear each other. */
export const CAPITAL_NOT_YET = 'not-yet';
export const CAPITAL: readonly Choice[] = [
  { id: 'personal', label: 'My own money' },
  { id: 'prop', label: "A prop firm's money" },
  { id: CAPITAL_NOT_YET, label: 'Not yet' },
];

/** K47: Keel's list of plain broker and platform names, A to Z (the brokers page names none). Other and None yet follow it. */
export const BROKER_NAMES: readonly string[] = [
  'Ally Invest',
  'Alpaca',
  'Binance',
  'Charles Schwab',
  'Coinbase',
  'cTrader',
  'DAS Trader',
  'E*TRADE',
  'eToro',
  'Fidelity',
  'IG',
  'Interactive Brokers',
  'Kraken',
  'Lightspeed',
  'MetaTrader 5',
  'NinjaTrader',
  'OANDA',
  'Plus500',
  'Questrade',
  'Robinhood',
  'Saxo',
  'Tastytrade',
  'TradeStation',
  'Tradier',
  'Trading 212',
  'Tradovate',
  'Webull',
];
export const BROKER_OTHER = 'Other';
export const BROKER_NONE = 'None yet';
export const BROKERS: readonly string[] = [
  ...BROKER_NAMES,
  BROKER_OTHER,
  BROKER_NONE,
];

export const INSTRUMENTS: readonly Choice[] = [
  { id: 'stocks', label: 'Stocks' },
  { id: 'options', label: 'Options' },
  { id: 'forex', label: 'Forex' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'futures', label: 'Futures' },
  { id: 'cfd', label: 'CFDs' },
  { id: 'other', label: 'Other' },
];

/** TradeZella's four goals, in Keel's words; Keel has no academy, so "learn" promises none. */
export const GOALS: readonly Choice[] = [
  {
    id: 'journal',
    label: 'Journal every trade',
    line: 'Record each trade and why you took it.',
  },
  {
    id: 'analyse',
    label: 'Analyse your performance',
    line: 'See the numbers behind your results.',
  },
  {
    id: 'backtest',
    label: 'Backtest strategies',
    line: 'Test an idea on past prices before you trade it.',
  },
  {
    id: 'learn',
    label: 'Learn and improve',
    line: 'Find what to fix in your own trades.',
  },
];

export const HEARD_OTHER = 'other';
export const HEARD: readonly Choice[] = [
  { id: 'search', label: 'A web search' },
  { id: 'ai', label: 'An AI assistant' },
  { id: 'x', label: 'X' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'community', label: 'A community or mentor' },
  { id: 'friend', label: 'A friend or colleague' },
  { id: HEARD_OTHER, label: 'Other' },
];

export type StepKind = 'single' | 'multi' | 'broker' | 'heard';
export interface StepContent {
  title: string;
  lede: string;
  kind: StepKind;
}

/** The six steps, in order. */
export const STEPS: readonly StepContent[] = [
  {
    title: 'How long have you been trading?',
    lede: 'Pick the closest.',
    kind: 'single',
  },
  {
    title: 'Whose capital do you trade?',
    lede: 'Pick all that apply.',
    kind: 'multi',
  },
  {
    title: 'Where do you trade?',
    lede: 'Pick your main broker or platform.',
    kind: 'broker',
  },
  { title: 'What do you trade?', lede: 'Pick all that apply.', kind: 'multi' },
  {
    title: 'What do you want from Keel?',
    lede: 'Pick all that apply.',
    kind: 'multi',
  },
  { title: 'How did you hear about Keel?', lede: 'Pick one.', kind: 'heard' },
];
