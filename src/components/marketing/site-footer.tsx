import Link from 'next/link';
import { MODULES } from '@/content/modules';
import { BadgeLogo } from './badge-logo';
import { PRIMARY_LINKS } from './nav-links';

const LINK =
  'inline-flex min-h-8 items-center text-[15px] font-medium text-stock no-underline hover:underline';

const HEAD =
  'mb-2 font-display text-lg font-bold tracking-[0.1em] text-gold uppercase';

export function SiteFooter() {
  return (
    <footer
      data-surface="navy"
      className="mt-auto bg-navy px-4 py-12 text-stock md:px-14"
    >
      <div className="grid gap-10 md:grid-cols-[auto_1fr_auto_auto] md:gap-16">
        <BadgeLogo />
        <div>
          <h2 className={HEAD}>Product</h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-x-6 p-0 md:max-w-md">
            {MODULES.filter((m) => m.hasPage).map((m) => (
              <li key={m.slug}>
                <Link href={`/features/${m.slug}`} className={LINK}>
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={HEAD}>Keel</h2>
          <ul className="m-0 list-none p-0">
            {PRIMARY_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={LINK}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={HEAD}>Legal</h2>
          <ul className="m-0 list-none p-0">
            <li>
              <Link href="/terms" className={LINK}>
                Terms
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={LINK}>
                Privacy
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <p className="mt-10 text-sm font-medium text-stock/80">© 2026 Keel</p>
    </footer>
  );
}
