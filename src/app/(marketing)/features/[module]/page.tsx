import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { OrderTicket } from '@/components/marketing/order-ticket';
import { PropRulesSection } from '@/components/marketing/landing/prop-rules';
import { SampleWeekSection } from '@/components/marketing/landing/sample-week';
import {
  AFTER_HEAD,
  SECTION,
  SectionHead,
} from '@/components/marketing/landing/section-head';
import { RubberStamp } from '@/components/marketing/rubber-stamp';
import { FEATURES } from '@/content/features';
import { MODULES, type ModuleSlug } from '@/content/modules';
import { getSampleView } from '@/lib/landing/sample-view';

type Params = { module: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return MODULES.filter((m) => m.hasPage).map((m) => ({ module: m.slug }));
}

function find(slug: string) {
  const info = MODULES.find((m) => m.slug === slug && m.hasPage);
  const content = info ? FEATURES[info.slug as ModuleSlug] : undefined;
  return info && content ? { info, content } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const found = find((await params).module);
  if (!found) return {};
  return { title: found.info.name, description: found.content.lede };
}

export default async function FeaturePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const found = find((await params).module);
  if (!found) notFound();
  const { info, content } = found;
  const planned = info.status === 'in-development';
  const view = getSampleView();

  return (
    <main className="overflow-x-clip">
      <section
        aria-labelledby="feature-title"
        className="px-4 pt-10 md:px-14 md:pt-16"
      >
        {planned ? (
          <RubberStamp tone="ink" size="md" className="mb-7 -rotate-[3deg]">
            In development
          </RubberStamp>
        ) : null}
        <h1
          id="feature-title"
          className="feature-h1 max-w-[13em] font-display font-black uppercase"
        >
          {content.headline}
        </h1>
        <p className="mt-6 max-w-[34em] text-lg leading-[1.45] font-medium md:mt-8 md:text-[21px]">
          {content.lede}
        </p>
      </section>

      <section aria-labelledby="points-title" className={SECTION}>
        <div className="grid gap-x-16 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <SectionHead
            id="points-title"
            title={planned ? 'The planned shape.' : 'What it does.'}
          >
            {planned
              ? 'Plans, not features. Nothing here works yet.'
              : 'Straight from how Keel files and measures your trades.'}
          </SectionHead>
          <dl
            className={`ticket-stock m-0 rounded-[3px] px-4 py-2 text-ink md:px-8 ${AFTER_HEAD} xl:mt-2`}
          >
            {content.points.map((p) => (
              <div
                key={p.title}
                className="grid gap-x-8 gap-y-1.5 border-b border-rule py-5 last:border-b-0 md:grid-cols-[210px_minmax(0,1fr)]"
              >
                <dt className="font-display text-[26px] leading-[0.95] font-black uppercase">
                  {p.title}
                </dt>
                <dd className="m-0 max-w-[36em] text-[17px] leading-[1.45] font-medium">
                  {p.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {content.demo === 'tickets' ? (
        <section aria-labelledby="tickets-title" className={SECTION}>
          <SectionHead id="tickets-title" title="Sample tickets, as filed.">
            Built from a sample week of fills. They are not a real account.
          </SectionHead>
          <ul
            className={`m-0 grid list-none gap-x-5 gap-y-8 p-0 sm:grid-cols-2 xl:grid-cols-4 ${AFTER_HEAD}`}
          >
            {view.heroTickets.map((t) => (
              <li key={t.serial} className="min-w-0">
                <OrderTicket variant="sample" model={t} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {content.demo === 'week' ? <SampleWeekSection view={view} /> : null}
      {content.demo === 'prop' ? (
        <PropRulesSection prop={view.prop} days={view.days} />
      ) : null}

      <section
        aria-labelledby="rest-title"
        className={`${SECTION} pb-24 md:pb-36`}
      >
        <div className="flex flex-col gap-10 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2
              id="rest-title"
              className="landing-h2 max-w-[10em] font-display font-black uppercase"
            >
              The rest of the rack.
            </h2>
            <ul className="m-0 mt-6 flex max-w-[44rem] list-none flex-wrap gap-x-6 gap-y-1 p-0 text-lg font-semibold md:text-xl">
              {MODULES.filter((m) => m.hasPage && m.slug !== info.slug).map(
                (m) => (
                  <li key={m.slug}>
                    <Link
                      href={`/features/${m.slug}`}
                      className="inline-block py-2 underline decoration-2 underline-offset-4"
                    >
                      {m.name}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
          <Link
            href="/#drop"
            className="close-go inline-flex min-h-14 items-center gap-3 self-start rounded px-6 py-3.5 font-display text-[26px] leading-none font-black tracking-[0.05em] whitespace-nowrap text-gold uppercase no-underline"
          >
            Build my journal
            <ArrowUp aria-hidden="true" strokeWidth={2.25} className="size-6" />
          </Link>
        </div>
      </section>
    </main>
  );
}
