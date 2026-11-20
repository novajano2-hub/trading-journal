import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { sampleFillsCsv } from '@/content/landing-sample-csv';
import { previewFromText } from '@/domain/import/preview';
import { ColumnMapping } from './column-mapping';

test('column mapping shows what the importer guessed, with the first row', () => {
  const html = renderToStaticMarkup(
    <ColumnMapping
      preview={previewFromText(sampleFillsCsv())}
      fileName="fills.csv"
    />,
  );
  for (const s of [
    'fills.csv',
    'Date/Time',
    'Buy/Sell',
    '2026-11-16 09:41:00',
    'ESZ5',
    '6010.00',
  ])
    expect(html).toContain(s);
  expect(html.match(/<tr/g)).toHaveLength(6);
  expect(html).toContain('>Buy<');
});
