import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUp } from 'lucide-react';
import { MODULES } from '@/content/modules';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Keel pricing has not been announced yet.',
};

export default function PricingPage() {
  const included = MODULES.filter((m) => m.status === 'milestone-1');
  return (
    <main className="overflow-x-clip px-4 pt-10 pb-24 md:px-14 md:pt-16 md:pb-36">
      <h1 className="feature-h1 max-w-[13em] font-display font-black uppercase">
        Pricing to be announced
      </h1>
      <p className="mt-6 max-w-[34em] text-lg leading-[1.45] font-medium md:mt-8 md:text-[21px]">
        There is no plan or price to show yet, so none is shown. Build your
        journal from your own trades now; it runs in your browser.
      </p>

      <section
        aria-labelledby="included-title"
        className="mt-16 grid gap-x-16 gap-y-8 md:mt-24 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"
      >
        <h2
          id="included-title"
          className="landing-h2 max-w-[8em] font-display font-black uppercase"
        >
          What is in the journal
        </h2>
        <ul className="ticket-stock m-0 list-none rounded-[3px] px-4 py-2 text-ink md:px-8">
          {included.map((m) => (
            <li
              key={m.slug}
              className="grid gap-x-8 gap-y-1 border-b border-rule py-5 last:border-b-0 md:grid-cols-[210px_minmax(0,1fr)]"
            >
              <span className="font-display text-[26px] leading-[0.95] font-black uppercase">
                {m.name}
              </span>
              <span className="max-w-[36em] text-[17px] leading-[1.45] font-medium">
                {m.oneLine}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 max-w-[34em] text-[17px] leading-[1.5] font-medium">
        Modules still in development are marked as such on their own pages.
      </p>

      <Link
        href="/#drop"
        className="close-go mt-12 inline-flex min-h-14 items-center gap-3 rounded px-6 py-3.5 font-display text-[26px] leading-none font-black tracking-[0.05em] whitespace-nowrap text-gold uppercase no-underline"
      >
        Build my journal
        <ArrowUp aria-hidden="true" strokeWidth={2.25} className="size-6" />
      </Link>
    </main>
  );
}
