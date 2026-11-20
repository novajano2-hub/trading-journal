import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { MODULES, type ModuleInfo } from '@/content/modules';
import { RubberStamp } from '../rubber-stamp';
import { AFTER_HEAD, SECTION, SectionHead } from './section-head';

/**
 * Where each card stands in the rack: its pocket width per breakpoint and how far
 * it rides above the lip. Live modules are full cards; the rest are shorter slips.
 */
const POCKET: Record<ModuleInfo['slug'], { span: string; card: string }> = {
  journal: {
    span: 'col-span-2 md:col-span-3 xl:col-span-3',
    card: 'min-h-[236px] md:min-h-[300px]',
  },
  analytics: {
    span: 'md:col-span-3 xl:col-span-2',
    card: 'min-h-[262px] md:min-h-[262px]',
  },
  strategies: {
    span: 'md:col-span-2 xl:col-span-3',
    card: 'min-h-[286px] md:min-h-[284px]',
  },
  notebook: {
    span: 'md:col-span-2 xl:col-span-2',
    card: 'min-h-[300px] md:min-h-[248px]',
  },
  'prop-firms': {
    span: 'md:col-span-2 xl:col-span-2',
    card: 'min-h-[276px] md:min-h-[270px]',
  },
  backtesting: {
    span: 'col-span-2 md:col-span-3 xl:col-span-3',
    card: 'min-h-[176px] md:min-h-[214px]',
  },
  replay: {
    span: 'col-span-2 md:col-span-3 xl:col-span-2',
    card: 'min-h-[168px] md:min-h-[194px]',
  },
  mentors: {
    span: 'col-span-2 md:col-span-3 xl:col-span-4',
    card: 'min-h-[176px] md:min-h-[222px]',
  },
  assistant: {
    span: 'col-span-2 md:col-span-3 xl:col-span-3',
    card: 'min-h-[168px] md:min-h-[204px]',
  },
};

function CardFace({ m }: { m: ModuleInfo }) {
  const live = m.status === 'milestone-1';
  return (
    <>
      <h3 className="font-display text-[30px] leading-[0.9] font-black uppercase md:text-[40px]">
        {m.name}
      </h3>
      {live ? null : (
        <RubberStamp
          tone="ink"
          size="xs"
          className="mt-3 -rotate-[3deg] self-start"
        >
          In development
        </RubberStamp>
      )}
      <span className="ruled mt-3 block flex-1 text-[15px] leading-[28px] font-medium md:text-base md:leading-[28px]">
        {m.oneLine}
      </span>
      {m.hasPage ? (
        <ArrowUpRight
          aria-hidden="true"
          strokeWidth={2}
          className="absolute right-3.5 bottom-[38px] size-6 md:right-5"
        />
      ) : null}
    </>
  );
}

/** Every module as a card standing in a time-card rack, not a grid of equal tiles. */
export function RackSection() {
  return (
    <section aria-labelledby="rack-title" className={SECTION}>
      <SectionHead id="rack-title" title="Every tool, one rack.">
        Every tool works off the same filed tickets. The ones still being built
        say so on the card.
      </SectionHead>

      <ul
        className={`m-0 grid list-none grid-cols-2 items-end gap-y-12 p-0 md:grid-cols-6 md:gap-y-14 xl:grid-cols-12 ${AFTER_HEAD}`}
      >
        {MODULES.map((m) => {
          const pocket = POCKET[m.slug];
          const card = `rack-card ticket-stock relative flex w-full flex-col rounded-t-[3px] px-3.5 pt-4 pb-[68px] text-ink no-underline md:px-5 md:pt-5 ${pocket.card}`;
          return (
            <li
              key={m.slug}
              className={`rack-pocket flex min-w-0 px-1.5 md:px-2.5 ${pocket.span}`}
            >
              {m.hasPage ? (
                <Link href={`/features/${m.slug}`} className={card}>
                  <CardFace m={m} />
                </Link>
              ) : (
                <div className={card}>
                  <CardFace m={m} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
