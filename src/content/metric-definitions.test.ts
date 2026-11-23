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
  expect(metricDefinition('weekly-goal', 'gross').definition).toContain(
    'Always net',
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
