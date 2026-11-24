import Link from 'next/link';
import { BrandMark } from '@/components/site/brand-mark';

const FOOT_LINK =
  'inline-flex min-h-11 items-center rounded-chip px-1.5 text-[13px] text-faint no-underline hover:text-text';

/*
 * Log in and Sign up: a focused page with no site navigation. The Keel mark
 * sits centred at the top, the form in a centred column under it, and one
 * quiet line of legal links at the foot.
 */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-20 items-center justify-center px-5 sm:h-24">
        <BrandMark className="rounded-control px-1.5 py-1" />
      </header>
      {children}
      <footer className="flex items-center justify-center gap-2 px-5 pt-6 pb-6">
        <Link href="/privacy" className={FOOT_LINK}>
          Privacy
        </Link>
        <Link href="/terms" className={FOOT_LINK}>
          Terms
        </Link>
      </footer>
    </div>
  );
}
