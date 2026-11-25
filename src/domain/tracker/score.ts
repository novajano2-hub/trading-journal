import type {
  AccountDayInputs,
  Cents,
  TrackerStage,
  TrackerVersion,
} from '../types';
import { weekdayOf } from './defaults';

export type RuleKey =
  | 'startBy'
  | 'hours'
  | 'strategy'
  | 'stop'
  | 'lossPerTrade'
  | 'lossPerDay'
  | `custom:${string}`;
export type RuleStatus = 'met' | 'failed' | 'pending';
export type RuleValue =
  | { kind: 'time'; at?: string; limit: string }
  | { kind: 'share'; x: number; y: number }
  | {
      kind: 'money';
      cents: Cents /* a loss, >= 0; 0 on a green day */;
      limit: Cents;
    }
  | { kind: 'tick'; ticked: boolean };
export interface RuleResult {
  key: RuleKey;
  stage: TrackerStage;
  status: RuleStatus;
  points: 0 | 1;
  /** For averages. TradeZella's: the share rules' x of y (strategy, stop), and the daily cap's
   *  loss, 0 on a green day [connector day] (P6A-02). Keel's: hours as a share (TradeZella's pair is
   *  INFERRED, K10); tick rules as 1 or 0 (TradeZella's custom-rule data is UNKNOWN); startBy as minutes
   *  after midnight, or null with none (empty with none [connector day]; the logged value is INFERRED);
   *  lossPerTrade as the largest loss in positive cents (K6; TradeZella's score is an [x, y] pair). */
  score: number | null;
  value: RuleValue;
}
export type Unscored = 'before-start' | 'not-trading-day' | 'future';
export interface DayScore {
  date: string;
  unscored?: Unscored;
  rules: RuleResult[];
  met: number;
  active: number;
  perfect: boolean;
  finished: boolean;
}
export interface ScoreArgs {
  date: string;
  today: string;
  /** HH:mm, profile zone. */
  nowTime: string;
  startedOn: string;
  version: TrackerVersion | undefined;
  /** Summed over the selected accounts: every rule but the daily cap reads these. */
  inputs: AccountDayInputs;
  /** Summed over every account in the workspace: the daily cap reads these, whatever the selection,
   *  as it "caps the day's net loss across all accounts" [help 10371695] (P6A-01). */
  allInputs: AccountDayInputs;
  ticks: Readonly<Record<string, boolean>>;
  /** HH:mm via stampTime. */
  noteStartedAt?: string;
  finished: boolean;
}

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

function unscoredDay(date: string, finished: boolean, u: Unscored): DayScore {
  return {
    date,
    unscored: u,
    rules: [],
    met: 0,
    active: 0,
    perfect: false,
    finished,
  };
}

/** One day's rules, from the version in effect that date (K3, K19, K20). */
export function scoreDay(a: ScoreArgs): DayScore {
  const { date, version } = a;
  if (!version || date < a.startedOn) {
    return unscoredDay(date, a.finished, 'before-start');
  }
  if (date > a.today) return unscoredDay(date, a.finished, 'future');
  const weekday = weekdayOf(date);
  if (!version.tradingDays[weekday]) {
    return unscoredDay(date, a.finished, 'not-trading-day');
  }

  // A trading day with no trades: the start rule and custom ticks can still be met while the trade
  // rules score 0, so the day is never perfect and breaks the streak. This is Keel's call
  // (TradeZella's evidence is confounded: no start was logged and no custom rules existed).
  const ended = date < a.today || a.finished;
  const i = a.inputs;
  const b = version.builtIn;
  const make = (
    key: RuleKey,
    stage: TrackerStage,
    status: RuleStatus,
    score: number | null,
    value: RuleValue,
  ): RuleResult => ({
    key,
    stage,
    status,
    points: status === 'met' ? 1 : 0,
    score,
    value,
  });
  /** Share rules: met when every trade counts, failed once one can't, else pending until the day ends. */
  const share = (
    key: RuleKey,
    stage: TrackerStage,
    x: number,
    y: number,
    failsAtOnce: boolean,
  ): RuleResult => {
    let status: RuleStatus;
    if (y > 0 && x === y) status = 'met';
    else if (ended || (failsAtOnce && x < y)) status = 'failed';
    else status = 'pending';
    const score = y > 0 ? x / y : ended ? 0 : null;
    return make(key, stage, status, score, { kind: 'share', x, y });
  };

  const byStage: Record<TrackerStage, RuleResult[]> = {
    prepare: [],
    trade: [],
    reflect: [],
  };

  if (b.startBy.on) {
    const at = a.noteStartedAt;
    const limit = b.startBy.time;
    let status: RuleStatus;
    if (at !== undefined) status = at <= limit ? 'met' : 'failed';
    else status = ended || a.nowTime > limit ? 'failed' : 'pending';
    byStage.prepare.push(
      make(
        'startBy',
        'prepare',
        status,
        at !== undefined ? minutesOf(at) : null,
        at !== undefined
          ? { kind: 'time', at, limit }
          : { kind: 'time', limit },
      ),
    );
  }

  if (b.hours.on) {
    byStage.trade.push(share('hours', 'trade', i.inHours, i.opened, true));
  }
  if (b.strategy.on) {
    byStage.reflect.push(
      share('strategy', 'reflect', i.withStrategy, i.opened, false),
    );
  }
  if (b.stop.on) {
    byStage.reflect.push(share('stop', 'reflect', i.withStop, i.opened, false));
  }
  if (b.lossPerTrade.on) {
    const r = share(
      'lossPerTrade',
      'reflect',
      i.withinTradeLoss,
      i.moneyOpened,
      true,
    );
    r.score = i.moneyOpened > 0 || ended ? i.largestLoss : null;
    byStage.reflect.push(r);
  }
  if (b.lossPerDay.on) {
    const c = a.allInputs;
    const loss = Math.max(0, -c.dayNet);
    const limit = b.lossPerDay.amount;
    let status: RuleStatus;
    if (loss > limit) status = 'failed';
    else if (c.booked) status = 'met';
    else status = ended ? 'failed' : 'pending';
    byStage.reflect.push(
      make('lossPerDay', 'reflect', status, c.booked || ended ? loss : null, {
        kind: 'money',
        cents: loss,
        limit,
      }),
    );
  }

  for (const c of version.custom) {
    if (!c.days[weekday]) continue;
    const ticked = a.ticks[c.id] === true;
    byStage[c.stage].push(
      make(
        `custom:${c.id}`,
        c.stage,
        ticked ? 'met' : ended ? 'failed' : 'pending',
        ticked ? 1 : 0,
        { kind: 'tick', ticked },
      ),
    );
  }

  const rules = [...byStage.prepare, ...byStage.trade, ...byStage.reflect];
  const met = rules.filter((r) => r.status === 'met').length;
  return {
    date,
    rules,
    met,
    active: rules.length,
    perfect: rules.length > 0 && met === rules.length,
    finished: a.finished,
  };
}
