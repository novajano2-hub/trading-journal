import { expect, test } from 'vitest';
import { formatPicks, modeOf, parsePicks } from './metric-chips';

test('the link carries the kind and, when it is running, the mode', () => {
  const picks = parsePicks('net:bar,win-rate:line:running,volume');
  expect(picks).toEqual([
    { metric: 'net', kind: 'bar', mode: 'period' },
    { metric: 'win-rate', kind: 'line', mode: 'running' },
    { metric: 'volume', kind: 'bar', mode: 'period' },
  ]);
  expect(formatPicks(picks)).toBe('net:bar,win-rate:line:running,volume:bar');
});

test('a mode that is not running is per period, and a fourth metric is dropped', () => {
  const picks = parsePicks('net:bar:later,trades,fees,sharpe,net');
  expect(picks.map((p) => p.metric)).toEqual(['net', 'trades', 'fees']);
  expect(picks[0]!.mode).toBe('period');
});

test('Cumulative P&L is a running total whatever the link says', () => {
  const [pick] = parsePicks('cumulative-net:line');
  expect(modeOf(pick!)).toBe('running');
});

test('an unknown metric in the link is skipped', () => {
  expect(parsePicks('nonsense:bar,net').map((p) => p.metric)).toEqual(['net']);
});
