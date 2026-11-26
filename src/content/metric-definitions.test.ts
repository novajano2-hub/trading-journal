import { expect, test } from 'vitest';
import { METRIC_IDS, metricDefinition } from './metric-definitions';

test('every metric has a label and a definition', () => {
  for (const id of METRIC_IDS) {
    for (const basis of ['net', 'gross'] as const) {
      const d = metricDefinition(id, basis);
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.definition.length).toBeGreaterThan(0);
    }
  }
});

test('no definition contains an em or en dash', () => {
  for (const id of METRIC_IDS) {
    const d = metricDefinition(id, 'net');
    expect(d.label + d.definition).not.toMatch(/[—–]/);
  }
});

test('the basis shows in the label and the definitions that use it', () => {
  expect(metricDefinition('pnl', 'gross').label).toBe('Gross P&L');
  expect(metricDefinition('pnl', 'net').label).toBe('Net P&L');
  expect(metricDefinition('rule-cost-broken', 'gross').definition).toContain(
    'gross P&L',
  );
  expect(metricDefinition('rule-cost-broken', 'net').definition).toContain(
    'net P&L',
  );
});

test('cumulative P&L has its own definition, apart from the period P&L', () => {
  const cumulative = metricDefinition('cumulative-pnl', 'net');
  expect(cumulative.label).toBe('Cumulative P&L');
  expect(cumulative.definition).toContain('running total');
  expect(cumulative.definition).not.toBe(
    metricDefinition('pnl', 'net').definition,
  );
});

test('the figures a narrowing unit changes say how they read in it', () => {
  // Balance figures have no value there; the largest trades read the unit.
  for (const id of ['sharpe', 'sortino', 'equity', 'max-drawdown'] as const) {
    const { definition } = metricDefinition(id, 'net');
    expect(definition, id).toMatch(/no value/);
    expect(definition, id).toMatch(/R, ticks, pips or points/);
  }
  for (const id of [
    'largest-win',
    'largest-loss',
    'avg-win',
    'avg-loss',
    'profit-factor',
  ] as const)
    expect(metricDefinition(id, 'net').definition, id).toMatch(
      /R, ticks, pips or points/,
    );
});

test('the progress tracker has a definition for every figure it labels', () => {
  for (const id of [
    'tracker-streak',
    'tracker-score',
    'tracker-today',
    'rule-streak',
    'rule-average',
    'tracker-follow-rate',
    'tracker-history',
    'tracker-card',
  ] as const) {
    expect(METRIC_IDS, id).toContain(id);
    expect(metricDefinition(id, 'net').definition.length, id).toBeGreaterThan(
      20,
    );
  }
  expect(metricDefinition('tracker-card', 'net').definition).toContain(
    'consistently',
  );
  expect(metricDefinition('tracker-card', 'net').definition).not.toContain(
    'streak',
  );
  // The strategy meaning stays the strategy's; the tracker has its own.
  expect(metricDefinition('rule-follow-rate', 'net').definition).not.toMatch(
    /progress tracker/,
  );
  expect(metricDefinition('tracker-follow-rate', 'net').definition).toMatch(
    /days that kept this rule/,
  );
});

test("the day's volume says it counts both sides", () => {
  expect(metricDefinition('day-volume', 'net').definition).toMatch(
    /both sides/,
  );
});

test('the upper dashboard widgets have a tip each, apart from the longest-streak ones', () => {
  const streaks = {
    'current-day-streak': /winning days in a row/i,
    'current-trade-streak': /winning trades in a row/i,
    'current-streaks': /winning days in a row.*winning trades in a row/i,
  } as const;
  for (const [id, words] of Object.entries(streaks)) {
    const d = metricDefinition(id as keyof typeof streaks, 'net');
    expect(METRIC_IDS as readonly string[], id).toContain(id);
    expect(d.definition, id).toMatch(words);
    // The current run, counted back from the last day or trade; a breakeven ends it.
    expect(d.definition, id).toMatch(/breakeven/i);
    expect(d.definition, id).not.toMatch(/longest|most/i);
  }
  const balance = metricDefinition('balance-and-pnl', 'net');
  expect(balance.label).toBe('Account balance and P&L');
  expect(balance.definition).toMatch(/end of the date range/);
  expect(balance.definition).toMatch(/no value in R, ticks, pips or points/);
  const avg = metricDefinition('avg-drawdown-card', 'net');
  expect(avg.definition).toMatch(/no date range/);
  expect(avg.definition).toMatch(/today/i);
});

test("the chart widgets have a tip of their own, in Keel's words", () => {
  const edge = metricDefinition('edge-score', 'net');
  expect(edge.label).toBe('Edge score');
  expect(edge.definition).toMatch(/0 to 100/);
  for (const part of [
    'win rate',
    'profit factor',
    'average win to loss',
    'recovery',
    'drawdown',
    'consistency',
  ])
    expect(edge.definition).toContain(part);
  // The bands, and the unit it never reads.
  expect(edge.definition).toMatch(/Weak.*Building.*Strong/);
  expect(edge.definition).toMatch(/whatever the display unit/);

  const winAvg = metricDefinition('win-avg-through-day', 'net');
  expect(winAvg.definition).toMatch(/time of day/);
  expect(winAvg.definition).toMatch(/left scale.*right scale/);

  expect(metricDefinition('daily-net-pnl', 'gross').label).toBe(
    'Gross daily P&L',
  );
  expect(metricDefinition('daily-and-cumulative', 'net').definition).toMatch(
    /Bars.*Line/,
  );
  const balance = metricDefinition('balance-chart', 'net');
  expect(balance.definition).toMatch(/deposits and withdrawals/);
  expect(balance.definition).toMatch(/right scale/);
  expect(balance.definition).toMatch(/no value in R, ticks, pips or points/);
  for (const id of ['trade-time-scatter', 'trade-duration-scatter'] as const) {
    const d = metricDefinition(id, 'net');
    expect(d.definition, id).toMatch(/filled dot.*hollow/);
  }
  expect(metricDefinition('trade-time-scatter', 'net').definition).toMatch(
    /entered or exited/,
  );
  expect(metricDefinition('trade-duration-scatter', 'net').definition).toMatch(
    /log scale/,
  );
});
