import type { Metadata } from 'next';
import Link from 'next/link';
import {
  READ_P,
  ReadPage,
  ReadSection,
} from '@/components/marketing/read-page';
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

const CODE = 'font-stamp text-[15px] font-normal';

function CodeList({ items }: { items: readonly string[] }) {
  return (
    <ul className="m-0 flex max-w-[68ch] list-none flex-wrap gap-x-2 gap-y-1 p-0">
      {items.map((i) => (
        <li
          key={i}
          className={`${CODE} rounded-[3px] border border-rule bg-stock px-2 py-0.5`}
        >
          {i}
        </li>
      ))}
    </ul>
  );
}

export default function BrokersPage() {
  const futures = Object.keys(FUTURES);
  const forex = `${[...FX_CODES].join(', ')}`;
  return (
    <ReadPage
      title="Brokers and file formats"
      lede={
        <>
          Keel reads a CSV or Excel export from your broker. Any export that
          carries the columns below can be read.
        </>
      }
    >
      <nav aria-label="On this page" className="mt-10">
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-lg font-semibold">
          {[
            ['#export', 'How to export'],
            ['#columns', 'Columns'],
            ['#symbols', 'Symbol formats'],
            ['#sync', 'Broker sync'],
          ].map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="inline-block py-2 underline decoration-2 underline-offset-4"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ReadSection id="export" title="How to export">
        <ol className={`${READ_P} m-0 list-decimal pl-6`}>
          <li className="pl-1">
            In your broker&apos;s platform or web account, open the history of
            executed orders, fills or trades.
          </li>
          <li className="pt-2 pl-1">
            Choose the date range you want to journal.
          </li>
          <li className="pt-2 pl-1">
            Export or download it as CSV or Excel. Where there is a choice, pick
            the fills or executions view, not account statements.
          </li>
          <li className="pt-2 pl-1">
            <Link
              href="/#drop"
              className="underline decoration-2 underline-offset-4"
            >
              Drop the file on the slot
            </Link>
            . Keel reads it in your browser and builds your tickets.
          </li>
        </ol>
      </ReadSection>

      <ReadSection id="columns" title="Columns Keel needs">
        <dl className="m-0 max-w-[68ch]">
          {REQUIRED.map(([name, note]) => (
            <div
              key={name}
              className="grid gap-x-8 border-b border-rule py-3 sm:grid-cols-[9rem_minmax(0,1fr)]"
            >
              <dt className="font-display text-2xl leading-none font-black uppercase">
                {name}
              </dt>
              <dd className="m-0 text-[17px] leading-[1.5] font-medium">
                {note}
              </dd>
            </div>
          ))}
        </dl>
        <p className={READ_P}>
          Optional, used when present: {OPTIONAL.join(', ').toLowerCase()}.
        </p>
      </ReadSection>

      <ReadSection id="symbols" title="Symbol formats Keel recognises">
        <h3 className="mt-2 text-xl font-bold">Futures</h3>
        <p className={READ_P}>
          A root, a month code and a year, such as ESZ5 or /MNQH6. Recognised
          roots:
        </p>
        <CodeList items={futures} />
        <h3 className="mt-4 text-xl font-bold">Options</h3>
        <p className={READ_P}>
          OCC format: underlying, expiry as YYMMDD, C or P, then the strike
          times 1000 padded to eight digits. For example{' '}
          <span className={CODE}>AAPL 251219C00200000</span>.
        </p>
        <h3 className="mt-4 text-xl font-bold">Forex</h3>
        <p className={READ_P}>
          Two currency codes, with or without a slash, such as EURUSD or
          EUR/USD. Currencies: {forex}.
        </p>
        <h3 className="mt-4 text-xl font-bold">Crypto</h3>
        <p className={READ_P}>
          A coin and a quote, such as BTC-USD, ETH/USDT or SOLUSDC. Coins:{' '}
          {CRYPTO_BASES.join(', ')}. Quotes: {CRYPTO_QUOTES.join(', ')}.
        </p>
        <h3 className="mt-4 text-xl font-bold">Stocks</h3>
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
