import { describe, expect, test } from 'vitest';
import { previewFromText } from './preview';

describe('previewFromText', () => {
  test('prints the first rows as rows and stops early', () => {
    const csv = [
      'Date/Time,Symbol,Buy/Sell,Quantity,Price',
      ...Array.from(
        { length: 50000 },
        (_, i) =>
          `2026-11-16 09:${String(i % 60).padStart(2, '0')}:00,ESZ5,${i % 2 ? 'SLD' : 'BOT'},1,6010.25`,
      ),
    ].join('\n');
    const p = previewFromText(csv);
    expect(p.rows).toHaveLength(4);
    expect(p.rows[0]).toEqual({
      rowIndex: 2,
      time: '2026-11-16 09:00:00',
      symbol: 'ESZ5',
      side: 'buy',
      qty: '1',
      price: '6010.25',
    });
    expect(p.rows[1]!.side).toBe('sell');
  });

  test('errors', () => {
    expect(() => previewFromText('')).toThrow(
      expect.objectContaining({ reason: 'empty' }),
    );
    expect(() => previewFromText('foo,bar\n1,2')).toThrow(
      expect.objectContaining({ reason: 'unrecognised' }),
    );
  });

  test('omits unguessed fields and unnormalizable sides, trims cells', () => {
    const p = previewFromText('Symbol, Side \n  ES , cancel\n');
    expect(p.rows).toEqual([{ rowIndex: 2, symbol: 'ES' }]);
  });

  test('preview rows carry their file row', () => {
    expect(previewFromText('Symbol\n\nES\n').rows).toEqual([
      { rowIndex: 3, symbol: 'ES' },
    ]);
  });

  test('a leading blank or whitespace-only line does not lose the header', () => {
    expect(previewFromText('\nSymbol\nES\n').rows).toEqual([
      { rowIndex: 3, symbol: 'ES' },
    ]);
    expect(previewFromText('  \nSymbol\nES\n').rows).toEqual([
      { rowIndex: 3, symbol: 'ES' },
    ]);
  });
});
