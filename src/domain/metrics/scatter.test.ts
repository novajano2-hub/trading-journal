import { describe, expect, test } from 'vitest';
import { makeTrade } from '../__fixtures__/trades';
import { defaultMetricContext } from './context';
import {
  DURATION_TICKS,
  durationAxis,
  scatterPoints,
  timeAxis,
} from './scatter';

const ctx = defaultMetricContext('America/New_York');

// 2026-03-03 is winter time in New York (UTC-5): 14:31Z is 09:31 ET.
const morning = makeTrade({
  id: 'am',
  net: 12_500,
  openedAt: '2026-03-03T14:31:00Z',
  closedAt: '2026-03-03T15:05:00Z',
});

describe('scatterPoints', () => {
  test('entry and exit read as minutes of the day in the profile zone', () => {
    expect(scatterPoints([morning], ctx, 'entry')).toEqual([
      { tradeId: 'am', x: 9 * 60 + 31, pnl: 12_500 },
    ]);
    expect(scatterPoints([morning], ctx, 'exit')).toEqual([
      { tradeId: 'am', x: 10 * 60 + 5, pnl: 12_500 },
    ]);
  });

  test('a summer trade reads the same wall clock under daylight time', () => {
    // 2026-07-01 is UTC-4: 13:31Z is 09:31 ET.
    const t = makeTrade({
      id: 'summer',
      net: -300,
      openedAt: '2026-07-01T13:31:00Z',
      closedAt: '2026-07-01T14:05:00Z',
    });
    expect(scatterPoints([t], ctx, 'entry')[0]?.x).toBe(9 * 60 + 31);
    expect(scatterPoints([t], ctx, 'exit')[0]?.x).toBe(10 * 60 + 5);
  });

  test('the zone decides the clock, and a trade can cross midnight', () => {
    const t = makeTrade({
      id: 'night',
      net: 100,
      openedAt: '2026-03-03T23:50:00Z',
      closedAt: '2026-03-04T00:20:00Z',
    });
    const tokyo = defaultMetricContext('Asia/Tokyo'); // UTC+9
    expect(scatterPoints([t], tokyo, 'entry')[0]?.x).toBe(8 * 60 + 50);
    expect(scatterPoints([t], tokyo, 'exit')[0]?.x).toBe(9 * 60 + 20);
    expect(scatterPoints([t], ctx, 'entry')[0]?.x).toBe(18 * 60 + 50);
    expect(scatterPoints([t], ctx, 'exit')[0]?.x).toBe(19 * 60 + 20);
  });

  test('duration is log10 of the minutes held', () => {
    const at = (id: string, minutes: number) =>
      makeTrade({
        id,
        net: 1,
        openedAt: '2026-03-03T15:00:00Z',
        closedAt: new Date(
          Date.parse('2026-03-03T15:00:00Z') + minutes * 60_000,
        ).toISOString(),
      });
    const points = scatterPoints(
      [at('a', 10), at('b', 100), at('c', 1440), at('d', 4)],
      ctx,
      'duration',
    );
    expect(points.map((p) => p.tradeId)).toEqual(['d', 'a', 'b', 'c']);
    expect(points.find((p) => p.tradeId === 'a')?.x).toBeCloseTo(1, 10);
    expect(points.find((p) => p.tradeId === 'b')?.x).toBeCloseTo(2, 10);
    expect(points.find((p) => p.tradeId === 'c')?.x).toBeCloseTo(
      Math.log10(1440),
      10,
    );
    expect(points.find((p) => p.tradeId === 'd')?.x).toBeCloseTo(
      Math.log10(4),
      10,
    );
  });

  test('a trade held under a minute plots at one minute', () => {
    const t = makeTrade({
      id: 'blink',
      net: 5,
      openedAt: '2026-03-03T15:00:00Z',
      closedAt: '2026-03-03T15:00:20Z',
    });
    const same = makeTrade({
      id: 'same',
      net: 5,
      openedAt: '2026-03-03T15:00:00Z',
      closedAt: '2026-03-03T15:00:00Z',
    });
    expect(scatterPoints([t], ctx, 'duration')[0]?.x).toBe(0);
    expect(scatterPoints([same], ctx, 'duration')[0]?.x).toBe(0);
  });

  test('y is the net P&L, or the gross one on a gross basis', () => {
    const t = makeTrade({ id: 'f', net: 900, fees: 100 });
    expect(scatterPoints([t], ctx, 'exit')[0]?.pnl).toBe(900);
    expect(
      scatterPoints([t], { ...ctx, pnlBasis: 'gross' }, 'exit')[0]?.pnl,
    ).toBe(1000);
  });

  test('keeps losses and breakevens as they are', () => {
    const l = makeTrade({ id: 'loss', net: -4_000 });
    const z = makeTrade({ id: 'flat', net: 0 });
    expect(scatterPoints([l, z], ctx, 'exit').map((p) => p.pnl)).toEqual([
      -4_000, 0,
    ]);
  });

  test('closed trades only, in the order they closed', () => {
    const open = makeTrade({
      id: 'open',
      net: 0,
      status: 'open',
    });
    const late = makeTrade({
      id: 'late',
      net: 1,
      serial: 1,
      closedAt: '2026-03-03T20:00:00Z',
    });
    const early = makeTrade({
      id: 'early',
      net: 1,
      serial: 2,
      closedAt: '2026-03-03T16:00:00Z',
    });
    expect(
      scatterPoints([open, late, early], ctx, 'exit').map((p) => p.tradeId),
    ).toEqual(['early', 'late']);
    expect(scatterPoints([open], ctx, 'entry')).toEqual([]);
    expect(scatterPoints([], ctx, 'duration')).toEqual([]);
  });

  test('does not reorder the caller list', () => {
    const a = makeTrade({ id: 'a', net: 1, closedAt: '2026-03-03T20:00:00Z' });
    const b = makeTrade({ id: 'b', net: 1, closedAt: '2026-03-03T16:00:00Z' });
    const list = [a, b];
    scatterPoints(list, ctx, 'exit');
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('DURATION_TICKS', () => {
  test('are the twelve labels of the hold-time axis', () => {
    expect(DURATION_TICKS).toEqual([
      '4m',
      '8m',
      '15m',
      '30m',
      '1h',
      '2h',
      '4h',
      '7h',
      '14h',
      '1d',
      '2d',
      '4d',
    ]);
  });
});

describe('timeAxis (C19)', () => {
  const texts = (a: { ticks: { text: string }[] }) =>
    a.ticks.map((t) => t.text);

  test('a long range reads by the hour, out to the hours the trades span', () => {
    const a = timeAxis([9 * 60 + 31, 15 * 60 + 45], false);
    expect(a.lo).toBe(9 * 60);
    expect(a.hi).toBe(16 * 60);
    expect(texts(a)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
    expect(a.ticks[0]).toEqual({ at: 540, text: '09:00' });
  });

  test('one day reads finer, as fine as keeps the labels to eight', () => {
    const short = timeAxis([9 * 60 + 31, 10 * 60 + 5], true);
    expect(short.lo).toBe(9 * 60 + 30);
    expect(short.hi).toBe(10 * 60 + 5);
    expect(short.ticks).toHaveLength(8);
    expect(texts(short).slice(0, 3)).toEqual(['09:30', '09:35', '09:40']);
    const longer = timeAxis([9 * 60 + 31, 11 * 60 + 11], true);
    expect(texts(longer)[1]).toBe('09:45');
    // A whole session falls back to the hour.
    const day = timeAxis([9 * 60 + 31, 15 * 60 + 45], true);
    expect(day.ticks.length).toBeLessThanOrEqual(8);
    expect(texts(day).slice(0, 2)).toEqual(['09:00', '10:00']);
  });

  test('one point still has a span, and nothing is a working day', () => {
    const one = timeAxis([10 * 60 + 12], false);
    expect([one.lo, one.hi]).toEqual([10 * 60, 11 * 60]);
    const none = timeAxis([], false);
    expect(none.lo).toBeLessThan(none.hi);
    expect(none.ticks.length).toBeGreaterThan(1);
  });

  test('stays inside the day', () => {
    const a = timeAxis([0, 23 * 60 + 59], false);
    expect([a.lo, a.hi]).toEqual([0, 24 * 60]);
    expect(texts(a)[a.ticks.length - 1]).toBe('24:00');
  });
});

describe('durationAxis (C19)', () => {
  const minutes = (m: number) => Math.log10(m);
  const texts = (a: { ticks: { text: string }[] }) =>
    a.ticks.map((t) => t.text);

  test('the ladder tightens to the rungs around the range', () => {
    const a = durationAxis([minutes(10), minutes(300)]);
    expect(texts(a)).toEqual(['8m', '15m', '30m', '1h', '2h', '4h', '7h']);
    expect(a.lo).toBeCloseTo(minutes(8), 10);
    expect(a.hi).toBeCloseTo(minutes(420), 10);
    // A tick sits at the log of the minutes it names.
    expect(a.ticks.find((t) => t.text === '1h')?.at).toBeCloseTo(
      minutes(60),
      10,
    );
  });

  test('a rung exactly on a trade is its own edge', () => {
    const a = durationAxis([minutes(15), minutes(60)]);
    expect(texts(a)).toEqual(['15m', '30m', '1h']);
  });

  test('holds under four minutes bring the ladder down to one', () => {
    const a = durationAxis([minutes(1), minutes(30)]);
    expect(texts(a)).toEqual(['1m', '2m', '4m', '8m', '15m', '30m']);
  });

  test('holds over four days bring it up to eight', () => {
    const a = durationAxis([minutes(2000), minutes(9000)]);
    expect(texts(a)).toEqual(['1d', '2d', '4d', '8d']);
  });

  test('one point still has two rungs; nothing is the whole ladder', () => {
    expect(texts(durationAxis([minutes(10)]))).toEqual(['8m', '15m']);
    expect(texts(durationAxis([]))).toEqual([...DURATION_TICKS]);
  });
});
