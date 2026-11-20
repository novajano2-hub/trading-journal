import { describe, expect, test } from 'vitest';
import { previewFromText } from './preview';

describe('previewFromText', () => {
  test('prints the first rows as tickets and stops early', () => {
    const csv = [
      'Date/Time,Symbol,Buy/Sell,Quantity,Price',
      ...Array.from(
        { length: 50000 },
        (_, i) =>
          `2026-11-16 09:${String(i % 60).padStart(2, '0')}:00,ESZ5,${i % 2 ? 'SLD' : 'BOT'},1,6010.25`,
      ),
    ].join('\n');
    const p = previewFromText(csv);
    expect(p.tickets).toHaveLength(4);
    expect(p.tickets[0]).toEqual({
      time: '2026-11-16 09:00:00',
      symbol: 'ESZ5',
      side: 'buy',
      qty: '1',
      price: '6010.25',
    });
    expect(p.tickets[1]!.side).toBe('sell');
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
    expect(p.tickets).toEqual([{ symbol: 'ES' }]);
  });
});
