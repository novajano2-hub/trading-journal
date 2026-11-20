import Link from 'next/link';
import { BadgeLogo } from './badge-logo';
import { MobileMenu } from './mobile-menu';
import { PRIMARY_LINKS } from './nav-links';
import { ProductMenu } from './product-menu';

const NAV_TEXT =
  'font-display text-[21px] font-bold tracking-[0.06em] uppercase text-navy no-underline';

export function SiteHeader() {
  return (
    <header className="relative z-50 flex h-[88px] items-center gap-8 px-4 md:px-14">
      <BadgeLogo />
      <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
        <ProductMenu variant="popover" />
        {PRIMARY_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={NAV_TEXT}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto hidden items-center gap-7 md:flex">
        <Link href="/login" className={NAV_TEXT}>
          Log in
        </Link>
        <Link
          href="/#drop"
          className="rounded bg-navy px-[22px] py-3 font-display text-[21px] font-bold tracking-[0.06em] text-gold uppercase no-underline"
        >
          Get started
        </Link>
      </div>
      <div className="ml-auto md:hidden">
        <MobileMenu />
      </div>
    </header>
  );
}
