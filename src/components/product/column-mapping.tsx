import { ArrowRight, FileCsv } from '@phosphor-icons/react/dist/ssr';
import type { PreviewField } from '@/domain/import/guess-columns';
import type { Preview, PreviewRow } from '@/domain/import/preview';

/** Keel's name for each column the importer guesses, in table order. */
const KEEL_COLUMNS: readonly [PreviewField, string][] = [
  ['time', 'Time'],
  ['symbol', 'Symbol'],
  ['side', 'Side'],
  ['qty', 'Quantity'],
  ['price', 'Price'],
];

function cell(row: PreviewRow | undefined, field: PreviewField): string {
  const v = row?.[field];
  if (v === undefined) return '';
  return field === 'side' ? (v === 'buy' ? 'Buy' : 'Sell') : v;
}

/**
 * Which of a broker file's columns land in which of Keel's, with the first
 * row as the importer read it. Built from `previewFromText`, so the table
 * shows what the importer really guessed.
 */
export function ColumnMapping({
  preview,
  fileName,
  note = 'Column mapping',
  sample = false,
}: {
  preview: Preview;
  fileName: string;
  /** The label at the right of the file bar. */
  note?: string;
  /** Label the window as sample data. */
  sample?: boolean;
}) {
  const first = preview.tickets[0];
  const rows = KEEL_COLUMNS.flatMap(([field, keel]) => {
    const index = preview.guessed[field];
    return index === undefined
      ? []
      : [{ field, keel, from: preview.headers[index] ?? '' }];
  });
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-1 shadow-[var(--shadow)]">
      <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3.5">
        <FileCsv size={18} className="text-muted" aria-hidden="true" />
        <b className="text-sm font-medium">{fileName}</b>
        <span className="ml-auto text-xs text-faint">{note}</span>
        {sample ? (
          <span className="text-xs text-faint">Sample data</span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table aria-label="Column mapping" className="w-full text-[13.5px]">
          <thead>
            <tr className="bg-sunken text-left text-[12.5px] font-medium text-muted">
              <th scope="col" className="px-4 py-2.5 font-medium">
                In your file
              </th>
              <th scope="col" className="w-8 px-0 py-2.5">
                <span className="sr-only">Maps to</span>
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                In Keel
              </th>
              <th
                scope="col"
                className="hidden px-4 py-2.5 font-medium md:table-cell"
              >
                First row
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.field} className="border-t border-line">
                <td className="px-3 py-3 sm:px-4">{r.from}</td>
                <td className="px-0 py-3 text-faint">
                  <ArrowRight size={14} aria-hidden="true" />
                </td>
                <td className="px-3 py-3 sm:px-4">{r.keel}</td>
                <td className="hidden px-3 py-3 font-mono text-faint sm:px-4 md:table-cell">
                  {cell(first, r.field)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
