import { describe, expect, test } from 'vitest';
import { PreviewError } from '@/domain/import/preview';
import { previewFile } from './preview-file';

const CSV =
  'Time,Symbol,Side,Qty,Price\n2026-11-16 09:41:07,ESZ5,BOT,1,6010.25\n';

describe('previewFile', () => {
  test('trusts the .csv extension, whatever the MIME type says', async () => {
    const file = new File([CSV], 'fills.csv', {
      type: 'application/octet-stream',
    });
    const preview = await previewFile(file);
    expect(preview.rows[0]).toMatchObject({ symbol: 'ESZ5' });
  });

  test('reads a .txt export', async () => {
    const file = new File([CSV], 'fills.txt', { type: 'text/plain' });
    expect((await previewFile(file)).rows).toHaveLength(1);
  });

  test('rejects a .png as unrecognised', async () => {
    const file = new File([CSV], 'chart.png', { type: 'image/png' });
    await expect(previewFile(file)).rejects.toMatchObject({
      name: 'PreviewError',
      reason: 'unrecognised',
    });
    await expect(previewFile(file)).rejects.toBeInstanceOf(PreviewError);
  });
});
