import { ColumnMapping } from '@/components/product/column-mapping';
import { ASSET_EXAMPLES } from '@/content/asset-examples';
import { sampleFillsCsv } from '@/content/landing-sample-csv';
import { previewFromText } from '@/domain/import/preview';
import { SectionHeading } from './section-heading';

/** "Bring the export your broker already gives you.": the real mapping, then the five markets. */
export function ImportSection() {
  const preview = previewFromText(sampleFillsCsv());
  return (
    <section
      aria-labelledby="import-title"
      className="border-y border-line bg-bg py-28"
    >
      <div className="mx-auto grid max-w-[1280px] items-start gap-12 px-5 sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div>
          <SectionHeading
            id="import-title"
            title="Bring the export your broker already gives you."
          >
            Map the columns once. Keel matches fills into trades, first in first
            out, across five markets.
          </SectionHeading>
          <ul aria-label="Asset classes" className="mt-7 flex flex-wrap gap-2">
            {ASSET_EXAMPLES.map((a) => (
              <li
                key={a.assetClass}
                className="inline-flex h-[34px] items-center gap-2 rounded-control border border-line bg-surface-1 px-3 text-[13.5px] shadow-[0_1px_1px_rgb(18_22_51/0.04)]"
              >
                <b className="font-semibold tnum">{a.display}</b>
                <span className="text-faint">{a.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <ColumnMapping preview={preview} fileName="fills-november.csv" sample />
      </div>
    </section>
  );
}
