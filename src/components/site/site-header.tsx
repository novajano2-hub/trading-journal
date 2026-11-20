import Link from 'next/link';
import { BrandMark } from './brand-mark';
import { MobileMenu } from './mobile-menu';
import { LOGIN_HREF, PRIMARY_LINKS, START_HREF } from './nav-links';
import { ProductMenu } from './product-menu';

const LINK =
  'inline-flex min-h-11 items-center rounded-control text-[14.5px] text-muted no-underline transition-colors hover:text-text';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg [--header-h:65px]">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-9 px-5 sm:px-10">
        <BrandMark />
        <nav
          aria-label="Primary"
          className="hidden items-center gap-[26px] lg:flex"
        >
          <ProductMenu variant="popover" />
          {PRIMARY_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={LINK}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-5 lg:flex">
          <Link href={LOGIN_HREF} className={LINK}>
            Log in
          </Link>
          <Link
            href={START_HREF}
            className="inline-flex h-[38px] items-center rounded-control bg-accent px-4 text-sm font-medium whitespace-nowrap text-accent-fg no-underline transition-colors hover:bg-accent-hover"
          >
            Get started
          </Link>
        </div>
        <div className="ml-auto lg:hidden">
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
