/** A plain number, as the exports write one: -123.45, 0.50, 1e-7. */
const NUMBER = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;
/** What a spreadsheet would read as the start of a formula. */
const FORMULA = /^[=+\-@\t\r]/;

/**
 * One CSV field: text a spreadsheet would run as a formula (a cell starting
 * with `=`, `+`, `-`, `@`, a tab or a carriage return) gains a leading `'`
 * so it opens as text, and a number never does, so negative money stays a
 * number (E83). Then quoted when it holds a comma, a quote or a line break.
 * Every export writes its fields through this.
 */
export function csvField(field: string): string {
  const safe = FORMULA.test(field) && !NUMBER.test(field) ? `'${field}` : field;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A header and rows as CSV text, lines ending in CRLF. */
export function csvText(
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  return [header, ...rows]
    .map((r) => r.map((f) => csvField(f === null ? '' : String(f))).join(','))
    .join('\r\n');
}

/** Cents as a plain decimal: -123.45. */
export function decimalOf(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Saves CSV text as a download under `filename`. */
export function downloadCsv(csv: string, filename: string): void {
  // The byte order mark makes Excel read it as UTF-8.
  const url = URL.createObjectURL(
    new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
