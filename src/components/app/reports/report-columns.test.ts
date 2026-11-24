import { describe, expect, test } from 'vitest';
import {
  formatColumns,
  parseColumns,
  REPORT_COLUMNS,
  toggleColumn,
} from './report-columns';

const ALL = REPORT_COLUMNS.map((c) => c.id);

describe('the breakdown column choice in the address', () => {
  test('no param means every column, and every column writes no param', () => {
    expect(parseColumns(null)).toEqual(ALL);
    expect(parseColumns('')).toEqual(ALL);
    expect(formatColumns(ALL)).toBeNull();
  });

  test('a choice reads back as written, in the table order', () => {
    const shown = parseColumns('net,trades,avg-loss');
    expect(shown).toEqual(['trades', 'net', 'avg-loss']);
    expect(formatColumns(shown)).toBe('trades,net,avg-loss');
    expect(parseColumns(formatColumns(shown))).toEqual(shown);
  });

  test('unknown and repeated ids are dropped, and nothing valid means every column', () => {
    expect(parseColumns('net,net,bogus')).toEqual(['net']);
    expect(parseColumns('bogus,,x')).toEqual(ALL);
  });

  test('the new columns are in the set', () => {
    expect(ALL).toEqual(
      expect.arrayContaining(['avg-win', 'avg-loss', 'avg-daily-volume']),
    );
  });

  test('toggling keeps the table order and always leaves one column on', () => {
    expect(toggleColumn(ALL, 'average')).not.toContain('average');
    expect(toggleColumn(['trades'], 'net')).toEqual(['trades', 'net']);
    expect(
      toggleColumn(['net', 'trades'].length ? ['trades', 'net'] : [], 'net'),
    ).toEqual(['trades']);
    expect(toggleColumn(['trades'], 'trades')).toEqual(['trades']);
  });
});
