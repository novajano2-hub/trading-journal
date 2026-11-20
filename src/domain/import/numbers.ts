export type DecimalMark = '.' | ',';

/**
 * A number from a CSV cell. Strips currency symbols, a leading '+' and
 * accounting parentheses (negative). Thousands separators are accepted only in
 * groups of three, and the other mark is never read as a decimal: in '.' mode
 * a lone comma only counts as thousands when followed by exactly three digits.
 */
export function parseDecimal(raw: string, decimal: DecimalMark): number | null {
  let s = raw
    .trim()
    .replace(/[$€£¥]/g, '')
    .trim();
  let negative = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    negative = true;
    s = (paren[1] ?? '').trim();
  }
  if (s.startsWith('+')) s = s.slice(1).trim();
  else if (s.startsWith('-')) {
    if (negative) return null;
    negative = true;
    s = s.slice(1).trim();
  }

  const body =
    decimal === '.'
      ? String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.?\d+|\d+\.`
      : String.raw`\d{1,3}(?:[.\s  ]\d{3})+(?:,\d+)?|\d*,?\d+|\d+,`;
  if (!new RegExp(`^(?:${body})$`).test(s)) return null;

  const n = Number(
    decimal === '.'
      ? s.replace(/,/g, '')
      : s.replace(/[.\s  ]/g, '').replace(',', '.'),
  );
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
