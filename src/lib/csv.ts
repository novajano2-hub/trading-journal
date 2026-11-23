/** One CSV field, quoted when it holds a comma, a quote or a line break. */
function quote(field: string): string {
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** A header and rows as CSV text, lines ending in CRLF. */
export function csvText(
  header: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  return [header, ...rows]
    .map((r) => r.map((f) => quote(f === null ? '' : String(f))).join(','))
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
