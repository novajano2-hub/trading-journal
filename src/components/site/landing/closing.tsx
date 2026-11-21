import Link from 'next/link';
import { CTA_LG, CTA_PRIMARY } from '@/components/site/cta';
import { START_HREF } from '@/components/site/nav-links';

/** The last word: one sentence and the way in. */
export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="border-t border-line-2">
      <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-10 px-5 py-24 sm:px-10 md:flex-row md:items-end">
        <h2
          id="closing-title"
          className="max-w-[14ch] text-[clamp(38px,5vw,52px)] leading-[1.04] font-semibold tracking-[-0.032em] text-balance"
        >
          Start with last week&apos;s trades.
        </h2>
        <Link href={START_HREF} className={`${CTA_PRIMARY} ${CTA_LG}`}>
          Get started
        </Link>
      </div>
    </section>
  );
}
