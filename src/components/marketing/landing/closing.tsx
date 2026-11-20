import { ArrowUp } from 'lucide-react';
import { SECTION } from './section-head';

/** The close: end of session, back up to the slot. */
export function ClosingSection() {
  return (
    <section
      aria-labelledby="closing-title"
      className={`${SECTION} pb-24 md:pb-36 xl:flex xl:items-end xl:justify-between xl:gap-16`}
    >
      <h2
        id="closing-title"
        className="landing-close font-display font-black uppercase"
      >
        <span className="block">The bell’s rung.</span>{' '}
        <span className="block">File your day.</span>
      </h2>
      <div className="mt-8 flex max-w-[27rem] flex-col items-start gap-6 md:mt-10 xl:mt-0 xl:mb-1.5 xl:shrink-0">
        <p className="text-lg leading-[1.45] font-medium md:text-[21px]">
          Drop a broker CSV in the slot at the top. Your fills print as tickets,
          and the file stays in this browser.
        </p>
        <a
          href="#drop"
          className="close-go inline-flex min-h-14 items-center gap-3 rounded px-6 py-3.5 font-display text-[26px] leading-none font-black tracking-[0.05em] whitespace-nowrap text-gold uppercase no-underline"
        >
          Build my journal
          <ArrowUp aria-hidden="true" strokeWidth={2.25} className="size-6" />
        </a>
      </div>
    </section>
  );
}
