import { expect, test } from 'vitest';
import { ImportFileError, MAX_IMPORT_BYTES, readImportFile } from './read-file';

test('a csv file returns its text', async () => {
  const file = new File(['a,b\n1,2\n'], 'fills.csv');
  await expect(readImportFile(file)).resolves.toBe('a,b\n1,2\n');
});

test('a txt file is accepted', async () => {
  await expect(readImportFile(new File(['x'], 'fills.TXT'))).resolves.toBe('x');
});

test('other file types are unsupported', async () => {
  const err = await readImportFile(new File(['x'], 'a.xlsx')).catch((e) => e);
  expect(err).toBeInstanceOf(ImportFileError);
  expect(err).toMatchObject({ reason: 'unsupported' });
});

test('a file over the limit is too large', async () => {
  const big = new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'big.csv');
  await expect(readImportFile(big)).rejects.toMatchObject({
    reason: 'too-large',
  });
});

test('a file exactly at the limit is read', async () => {
  const edge = new File([new Uint8Array(MAX_IMPORT_BYTES)], 'edge.csv');
  await expect(readImportFile(edge)).resolves.toHaveLength(MAX_IMPORT_BYTES);
});
