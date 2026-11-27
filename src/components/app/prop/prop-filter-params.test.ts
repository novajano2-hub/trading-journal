import { expect, test } from 'vitest';
import {
  NO_SELECTION,
  parseSelection,
  propFilters,
  PROP_PARAMS,
  selectionCount,
  setSelection,
} from './prop-filter-params';

const read = (query: string) => parseSelection(new URLSearchParams(query));

test('an address with none of the six filters reads as no selection', () => {
  expect(read('')).toEqual(NO_SELECTION);
  expect(read('tab=funded&from=2026-10-01')).toEqual(NO_SELECTION);
});

test('every filter is read from its own parameter, firms and strategies as repeated values', () => {
  expect(
    read(
      'pfirm=Sample%20firm%20B&pfirm=Acme%2C%20Inc&pphase=funded&pstatus=breached&psize=5000000&psize=10000000&ptype=2-step&ptype=s2f&pstrategy=s-1',
    ),
  ).toEqual({
    firm: ['Sample firm B', 'Acme, Inc'],
    phase: 'funded',
    status: 'breached',
    size: [5_000_000, 10_000_000],
    type: ['2-step', 's2f'],
    strategy: ['s-1'],
  });
});

test('values that are not a choice are ignored, and repeats and blanks drop out', () => {
  expect(
    read(
      'pfirm=&pfirm=A&pfirm=A&pphase=both&pstatus=passed&psize=abc&psize=-5&psize=0&psize=2.5&ptype=3-step&ptype=1-step&ptype=1-step',
    ),
  ).toEqual({
    firm: ['A'],
    size: [],
    type: ['1-step'],
    strategy: [],
  });
});

test('the names do not collide with the trade filters that own status, size and strategy', () => {
  for (const name of Object.values(PROP_PARAMS))
    expect(['status', 'size', 'strategy']).not.toContain(name);
});

test('writing replaces the six parameters and keeps every other one in its place', () => {
  const params = new URLSearchParams(
    'tab=funded&pfirm=Old&pphase=funded&from=2026-10-01',
  );
  setSelection(params, {
    firm: ['New A', 'New B'],
    status: 'active',
    size: [5_000_000],
    type: ['1-step'],
    strategy: [],
  });
  expect(params.toString()).toBe(
    'tab=funded&from=2026-10-01&pfirm=New+A&pfirm=New+B&pstatus=active&psize=5000000&ptype=1-step',
  );
  setSelection(params, NO_SELECTION);
  expect(params.toString()).toBe('tab=funded&from=2026-10-01');
});

test('a selection survives its own round trip', () => {
  const sel = {
    firm: ['Sample firm B'],
    phase: 'evaluation' as const,
    status: 'active' as const,
    size: [5_000_000, 10_000_000],
    type: ['2-step' as const],
    strategy: ['a', 'b'],
  };
  const params = new URLSearchParams();
  setSelection(params, sel);
  expect(parseSelection(params)).toEqual(sel);
});

test('each filter that is set counts once, however many values it holds', () => {
  expect(selectionCount(NO_SELECTION)).toBe(0);
  expect(
    selectionCount({
      firm: ['A', 'B'],
      phase: 'funded',
      size: [1, 2, 3],
      type: [],
      strategy: [],
    }),
  ).toBe(3);
});

test('the finance filters carry only what is set, and a range only with an end', () => {
  expect(propFilters(NO_SELECTION, {})).toEqual({});
  expect(
    propFilters(
      {
        firm: ['A'],
        phase: 'funded',
        status: 'breached',
        size: [5_000_000],
        type: ['s2f'],
        strategy: ['s'],
      },
      { from: '2026-10-01' },
    ),
  ).toEqual({
    firm: ['A'],
    phase: 'funded',
    status: 'breached',
    size: [5_000_000],
    type: ['s2f'],
    strategy: ['s'],
    range: { from: '2026-10-01' },
  });
});
