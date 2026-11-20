import { isTextFileName } from './preview-file';

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export class ImportFileError extends Error {
  constructor(readonly reason: 'unsupported' | 'too-large') {
    super(
      reason === 'unsupported'
        ? 'Only .csv and .txt exports can be imported'
        : 'This file is larger than 20 MB',
    );
    this.name = 'ImportFileError';
  }
}

/** The file's text, read in the browser. The extension decides what is supported; size is capped. */
export async function readImportFile(file: File): Promise<string> {
  if (!isTextFileName(file.name)) throw new ImportFileError('unsupported');
  if (file.size > MAX_IMPORT_BYTES) throw new ImportFileError('too-large');
  return file.text();
}
