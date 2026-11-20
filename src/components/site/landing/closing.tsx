import Link from 'next/link';
import { START_HREF } from '@/components/site/nav-links';

/** The last word: one sentence and the way in. */
export function Closing() {
  return (
    <section aria-labelledby="closing-title" className="border-t border-line">
      <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-10 px-5 py-24 sm:px-10 md:flex-row md:items-end">
        <h2
          id="closing-title"
          className="max-w-[14ch] text-[clamp(38px,5vw,52px)] leading-[1.04] font-semibold tracking-[-0.04em] text-balance"
        >
          Start with last week&apos;s trades.
        </h2>
        <Link
          href={START_HREF}
          className="inline-flex h-[50px] items-center rounded-control bg-accent px-6 text-base font-medium whitespace-nowrap text-accent-fg no-underline transition-colors hover:bg-accent-hover"
        >
          Get started
        </Link>
      </div>
    </section>
  );
}
