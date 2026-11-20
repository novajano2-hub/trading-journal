import { PreviewError, previewFromText, type Preview } from '@/domain/import/preview';

const TEXT_NAME = /\.(csv|txt)$/i;

export async function previewFile(file: File, limit?: number): Promise<Preview> {
  const textMime = file.type === '' || file.type.startsWith('text/') || file.type === 'application/vnd.ms-excel';
  if (!textMime || !TEXT_NAME.test(file.name)) throw new PreviewError('unrecognised');
  // Only the head of the file is needed; 256 KB comfortably covers a handful of rows.
  const text = await file.slice(0, 256 * 1024).text();
  return previewFromText(text, limit);
}
