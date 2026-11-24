import Link from 'next/link';
import { MODULES } from '@/content/modules';
import { BrandMark } from './brand-mark';
import { PRIMARY_LINKS } from './nav-links';

const LINK =
  'inline-flex min-h-8 items-center py-1 text-sm text-muted no-underline hover:text-text';
const HEAD = 'mb-3 text-[13px] font-medium text-text';

const RESOURCES = [PRIMARY_LINKS[1], PRIMARY_LINKS[2], PRIMARY_LINKS[0]];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line-2 pt-12 pb-14 text-sm text-muted">
      <div className="mx-auto grid max-w-[1280px] grid-cols-2 gap-8 px-5 sm:px-10 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <BrandMark />
          <p className="mt-3.5 max-w-[32ch]">
            A trading journal for the whole review loop.
          </p>
          <p className="mt-5">© 2026 Keel</p>
        </div>
        <div>
          <h2 className={HEAD}>Product</h2>
          <ul className="m-0 list-none p-0">
            {MODULES.filter((m) => m.hasPage && m.status === 'milestone-1').map(
              (m) => (
                <li key={m.slug}>
                  <Link href={`/features/${m.slug}`} className={LINK}>
                    {m.name}
                  </Link>
                </li>
              ),
            )}
          </ul>
        </div>
        <div>
          <h2 className={HEAD}>Resources</h2>
          <ul className="m-0 list-none p-0">
            {RESOURCES.map((l) => (
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
    </footer>
  );
}
