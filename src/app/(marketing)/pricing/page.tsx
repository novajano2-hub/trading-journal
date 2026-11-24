import type { Metadata } from 'next';
import Link from 'next/link';
import { CTA_MD, CTA_PRIMARY } from '@/components/site/cta';
import { SectionHeading } from '@/components/site/landing/section-heading';
import { START_HREF } from '@/components/site/nav-links';
import { MODULES } from '@/content/modules';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Keel pricing has not been announced yet.',
};

const FRAME = 'mx-auto max-w-[1280px] px-5 sm:px-10';

export default function PricingPage() {
  const included = MODULES.filter((m) => m.status === 'milestone-1');
  return (
    <main>
      <section className={`${FRAME} pt-16 pb-24`}>
        <h1 className="max-w-[16ch] text-[clamp(36px,calc(2.6vw+16px),52px)] leading-[1.06] font-semibold tracking-[-0.032em] text-balance motion-safe:animate-rise">
          Pricing to be announced
        </h1>
        <p
          className="mt-5 max-w-[52ch] text-lg leading-[1.6] text-muted motion-safe:animate-rise"
          style={{ animationDelay: '60ms' }}
        >
          There is no plan or price to show yet, so none is shown. Pricing will
          be announced before accounts open.
        </p>
        <Link
          href={START_HREF}
          className={`mt-8 ${CTA_PRIMARY} ${CTA_MD} motion-safe:animate-rise`}
          style={{ animationDelay: '120ms' }}
        >
          Get started
        </Link>
      </section>

      <section
        aria-labelledby="included-title"
        className="border-t border-line-2"
      >
        <div className={`${FRAME} py-24`}>
          <SectionHeading id="included-title" title="What is in the journal">
            Modules still in development are marked as such on their own pages.
          </SectionHeading>
          <ul className="m-0 mt-14 grid list-none gap-0 overflow-hidden rounded-card bg-surface-1 p-0 shadow-[var(--shadow-card)] md:grid-cols-2">
            {included.map((m) => (
              <li
                key={m.slug}
                className="border-t border-line p-6 sm:p-8 md:nth-[-n+2]:border-t-0 md:odd:last:col-span-2"
              >
                <p className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.015em]">
                  {m.name}
                </p>
                <p className="mt-2 max-w-[52ch] text-[15.5px] leading-[1.65] text-muted">
                  {m.oneLine}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
