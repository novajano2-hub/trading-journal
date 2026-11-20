import type { Metadata } from 'next';
import Link from 'next/link';
import { ColumnMapping } from '@/components/product/column-mapping';
import { READ_P, ReadPage, ReadSection } from '@/components/site/read-page';
import { Chip } from '@/components/ui/chip';
import { sampleFillsCsv } from '@/content/landing-sample-csv';
import { previewFromText } from '@/domain/import/preview';
import {
  CRYPTO_BASES,
  CRYPTO_QUOTES,
  FUTURES,
  FX_CODES,
} from '@/domain/instruments';

export const metadata: Metadata = {
  title: 'Brokers and file formats',
  description:
    'How to export your trades from your broker and the symbol formats Keel recognises.',
};

const REQUIRED = [
  ['Time', 'When the fill happened, with date.'],
  ['Symbol', 'The instrument traded. Formats are listed below.'],
  ['Side', 'Buy or sell.'],
  ['Quantity', 'Size of the fill.'],
  ['Price', 'Fill price.'],
] as const;

const OPTIONAL = ['Fees', 'Commission', 'Account'] as const;

const H3 = 'mt-4 text-[17px] font-semibold tracking-[-0.015em]';
const LINK = 'font-medium text-accent-ink underline';

/** Registry formats as pills: each a symbol or code Keel recognises. */
function Pills({ items, label }: { items: readonly string[]; label: string }) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {items.map((i) => (
        <li key={i}>
          <Chip mono className="h-7 px-2.5 text-[13px]">
            {i}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

export default function BrokersPage() {
  const preview = previewFromText(sampleFillsCsv());
  return (
    <ReadPage
      title="Brokers and file formats"
      lede="The columns below are what Keel will read from a CSV export from your broker, or a text file in the same layout. File import arrives with the app. Excel files: export as CSV for now."
    >
      <nav aria-label="On this page" className="mt-8">
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-[15px]">
          {[
            ['#export', 'How to export'],
            ['#columns', 'Columns'],
            ['#symbols', 'Symbol formats'],
            ['#sync', 'Broker sync'],
          ].map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="inline-flex min-h-11 items-center font-medium text-accent-ink"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ReadSection id="export" title="How to export">
        <ol
          className={`${READ_P} m-0 list-decimal pl-6 marker:font-mono marker:text-faint`}
        >
          <li className="pl-1">
            In your broker&apos;s platform or web account, open the history of
            executed orders, fills or trades.
          </li>
          <li className="pt-2 pl-1">
            Choose the date range you want to journal.
          </li>
          <li className="pt-2 pl-1">
            Export or download it as CSV (Excel files: export as CSV for now).
            Where there is a choice, pick the fills or executions view, not
            account statements.
          </li>
          <li className="pt-2 pl-1">
            Import opens with the app release. When it does, files are read in
            your browser and nothing is uploaded. The{' '}
            <Link href="/privacy" className={LINK}>
              privacy page
            </Link>{' '}
            has the detail.
          </li>
        </ol>
      </ReadSection>

      <ReadSection id="columns" title="Columns Keel needs">
        <p className={READ_P}>
          Keel guesses which of your columns is which. This is the mapping it
          makes for a sample export.
        </p>
        <div className="mt-2 max-w-[760px]">
          <ColumnMapping
            preview={preview}
            fileName="fills-november.csv"
            note="Sample data"
          />
        </div>
        <dl className="m-0 mt-4 max-w-[68ch]">
          {REQUIRED.map(([name, note]) => (
            <div
              key={name}
              className="grid gap-x-8 border-t border-line py-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
            >
              <dt className="text-[15px] font-semibold">{name}</dt>
              <dd className="m-0 text-[15.5px] leading-[1.6] text-muted">
                {note}
              </dd>
            </div>
          ))}
        </dl>
        <p className={READ_P}>
          Optional, and read by the full import coming with the app:
        </p>
        <Pills items={OPTIONAL} label="Optional columns" />
      </ReadSection>

      <ReadSection id="symbols" title="Symbol formats Keel recognises">
        <h3 className={H3}>Futures</h3>
        <p className={READ_P}>
          A root, a month code and a year, such as ESZ5 or /MNQH6. Recognised
          roots:
        </p>
        <Pills items={Object.keys(FUTURES)} label="Futures roots" />
        <h3 className={H3}>Options</h3>
        <p className={READ_P}>
          OCC format: underlying, expiry as YYMMDD, C or P, then the strike
          times 1000 padded to eight digits. For example:
        </p>
        <Pills items={['AAPL 251219C00200000']} label="Options example" />
        <h3 className={H3}>Forex</h3>
        <p className={READ_P}>
          Two currency codes, with or without a slash, such as EURUSD or
          EUR/USD. Currencies:
        </p>
        <Pills items={[...FX_CODES]} label="Forex currencies" />
        <h3 className={H3}>Crypto</h3>
        <p className={READ_P}>
          A coin and a quote, such as BTC-USD, ETH/USDT or SOLUSDC. Coins:
        </p>
        <Pills items={CRYPTO_BASES} label="Crypto coins" />
        <p className={READ_P}>Quotes:</p>
        <Pills items={CRYPTO_QUOTES} label="Crypto quotes" />
        <h3 className={H3}>Stocks</h3>
        <p className={READ_P}>
          One to five letters, with an optional class suffix, such as AAPL or
          BRK.B.
        </p>
      </ReadSection>

      <ReadSection id="sync" title="Broker sync">
        <p className={READ_P}>Direct broker sync is on the roadmap.</p>
        <p className={READ_P}>Until then, a file export is the way in.</p>
      </ReadSection>
    </ReadPage>
  );
}
