import { expect, test } from 'vitest';
import { PATTERNS } from '@/domain/patterns';
import {
  METRIC_IDS,
  metricDefinition,
  type MetricId,
} from './metric-definitions';

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

test('every pattern has a definition headed by its name, and the Patterns column has one', () => {
  for (const p of PATTERNS) {
    const id = `pattern-${p.id}` as MetricId;
    expect(METRIC_IDS, p.id).toContain(id);
    const d = metricDefinition(id, 'net');
    expect(d.label).toBe(p.name);
    expect(d.definition.length, p.id).toBeGreaterThan(30);
    // The same wording whichever P&L basis is read.
    expect(metricDefinition(id, 'gross')).toEqual(d);
  }
  expect(metricDefinition('patterns', 'net').label).toBe('Patterns');
  expect(metricDefinition('patterns', 'net').definition).toMatch(/fills/);
  // Thresholds the definitions quote are the ones the patterns use.
  expect(metricDefinition('pattern-held-longer', 'net').definition).toContain(
    '75%',
  );
  expect(
    metricDefinition('pattern-loss-after-loss', 'net').definition,
  ).toContain('30 seconds');
});

test("the patterns report's Trades column says a day pattern counts that day's trades", () => {
  const d = metricDefinition('pattern-trades', 'net');
  expect(d.label).toBe('Trades');
  expect(d.definition).toContain('both rows');
  expect(d.definition).toContain("day pattern counts that day's trades");
});
