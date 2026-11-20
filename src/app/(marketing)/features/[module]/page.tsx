import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FeatureVisual } from '@/components/site/feature-visual';
import { SectionHeading } from '@/components/site/landing/section-heading';
import { START_HREF } from '@/components/site/nav-links';
import { Chip } from '@/components/ui/chip';
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

const FRAME = 'mx-auto max-w-[1280px] px-5 sm:px-10';

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
        className={`${FRAME} grid items-center gap-14 pt-16 pb-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]`}
      >
        <div>
          <h1
            id="feature-title"
            className="max-w-[16ch] text-[clamp(36px,calc(2.6vw+16px),52px)] leading-[1.06] font-semibold tracking-[-0.04em] text-balance motion-safe:animate-rise"
          >
            {content.headline}
          </h1>
          <p
            className="mt-5 max-w-[44ch] text-lg leading-[1.6] text-muted motion-safe:animate-rise"
            style={{ animationDelay: '60ms' }}
          >
            {content.lede}
          </p>
          <div
            className="mt-8 flex flex-wrap items-center gap-3 motion-safe:animate-rise"
            style={{ animationDelay: '120ms' }}
          >
            {planned ? (
              <Chip tone="accent" className="h-7 px-3 text-[13px]">
                In development
              </Chip>
            ) : (
              <Link
                href={START_HREF}
                className="inline-flex h-11 items-center rounded-control bg-accent px-[18px] text-[15px] font-medium whitespace-nowrap text-accent-fg no-underline transition-colors hover:bg-accent-hover"
              >
                Get started
              </Link>
            )}
          </div>
        </div>
        <div
          className="min-w-0 motion-safe:animate-rise-window"
          style={{ animationDelay: '180ms' }}
        >
          <FeatureVisual
            slug={info.slug as ModuleSlug}
            name={info.name}
            planned={planned}
            view={view}
          />
        </div>
      </section>

      <section aria-labelledby="points-title" className="border-t border-line">
        <div className={`${FRAME} py-24`}>
          <SectionHeading
            id="points-title"
            title={planned ? 'The planned shape.' : 'What it does.'}
          >
            {planned
              ? 'Plans, not features. Nothing here works yet.'
              : 'Straight from how Keel files and measures your trades.'}
          </SectionHeading>
          <dl
            data-testid="feature-points"
            className="m-0 mt-14 grid gap-x-16 gap-y-10 md:grid-cols-2"
          >
            {content.points.map((p) => (
              <div key={p.title} className="border-t border-line pt-5">
                <dt className="text-[17px] font-semibold tracking-[-0.015em]">
                  {p.title}
                </dt>
                <dd className="m-0 mt-2 max-w-[52ch] text-[15.5px] leading-[1.65] text-muted">
                  {p.body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="rest-title" className="border-t border-line">
        <div
          className={`${FRAME} flex flex-col items-start justify-between gap-10 py-20 lg:flex-row lg:items-end`}
        >
          <div>
            <h2
              id="rest-title"
              className="text-[26px] leading-[1.15] font-semibold tracking-[-0.03em]"
            >
              The rest of Keel
            </h2>
            <ul className="m-0 mt-4 flex max-w-[44rem] list-none flex-wrap gap-x-6 gap-y-1 p-0 text-[15px]">
              {MODULES.filter((m) => m.hasPage && m.slug !== info.slug).map(
                (m) => (
                  <li key={m.slug}>
                    <Link
                      href={`/features/${m.slug}`}
                      className="inline-flex min-h-11 items-center font-medium text-accent-ink"
                    >
                      {m.name}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </div>
          <Link
            href={START_HREF}
            className="inline-flex h-[50px] items-center rounded-control bg-accent px-6 text-base font-medium whitespace-nowrap text-accent-fg no-underline transition-colors hover:bg-accent-hover"
          >
            Get started
          </Link>
        </div>
      </section>
    </main>
  );
}
