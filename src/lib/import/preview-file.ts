import type { Preview } from '@/domain/import/preview';

const TEXT_NAME = /\.(csv|txt)$/i;

/** Whether the file name says a text export (the extension decides; the MIME type is not trusted). */
export function isTextFileName(name: string): boolean {
  return TEXT_NAME.test(name);
}

/**
 * Preview the head of a visitor's file. The extension decides whether to try;
 * parsing decides whether it is trades (browsers report CSVs as text/csv,
 * application/vnd.ms-excel or octet-stream, so the MIME type is not trusted).
 * papaparse loads here, on first use, and stays out of the page's first-load JS.
 */
export async function previewFile(
  file: File,
  limit?: number,
): Promise<Preview> {
  const { PreviewError, previewFromText } =
    await import('@/domain/import/preview');
  if (!isTextFileName(file.name)) throw new PreviewError('unrecognised');
  // Only the head of the file is needed; 256 KB comfortably covers a handful of rows.
  const text = await file.slice(0, 256 * 1024).text();
  return previewFromText(text, limit);
}
