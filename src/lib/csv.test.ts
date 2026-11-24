import { describe, expect, test } from 'vitest';
import { csvField, csvText } from './csv';

describe('the formula-injection guard (E83)', () => {
  test('a text cell that a spreadsheet would run as a formula gains a leading quote', () => {
    expect(csvField('=HYPERLINK("http://x","y")')).toBe(
      `"'=HYPERLINK(""http://x"",""y"")"`,
    );
    expect(csvField('+cmd')).toBe("'+cmd");
    expect(csvField('-abc')).toBe("'-abc");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('\tlead')).toBe("'\tlead");
    // A carriage return also needs the quotes around the field.
    expect(csvField('\rlead')).toBe(`"'\rlead"`);
  });

  test('a number stays a number: negative money, a negative ratio, an exponent', () => {
    for (const n of ['-123.45', '-0.50', '42', '0', '1e-7', '-1.5e-7', '+5'])
      expect(csvField(n), n).toBe(n);
  });

  test('ordinary text is untouched, and the header is guarded too', () => {
    expect(csvField('ES')).toBe('ES');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvText(['=Name', 'Net'], [['-oops', '-12.34']])).toBe(
      "'=Name,Net\r\n'-oops,-12.34",
    );
    expect(csvText(['Net'], [[-1234]])).toBe('Net\r\n-1234');
  });
});
