import Link from 'next/link';
import { WelcomeGuard } from '@/components/app/first-run-gate';
import { BrandMark } from '@/components/site/brand-mark';
import { DataProvider } from '@/data/query/provider';

const FOOT_LINK =
  'inline-flex min-h-11 items-center rounded-chip px-1.5 text-[13px] text-faint no-underline hover:text-text';

/*
 * The first run's pages (welcome and survey): the app's tokens, the auth
 * pages' centred look, and no shell. They sit at /app/welcome, outside the
 * (app) layout, so its gate doesn't send them back to the welcome.
 */
export default function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-surface="app"
      className="flex flex-1 flex-col items-center px-5 [--tab-bar:0px]"
    >
      <header className="flex h-24 flex-none items-center justify-center max-sm:h-[72px]">
        {/* Keel's call (TradeZella unknown): whether TradeZella's logo links out
            isn't recorded. The mark links to the marketing home; leaving the
            site isn't a trap, since the gate covers /app. */}
        <BrandMark className="rounded-control px-1.5 py-1" />
      </header>
      <main
        id="content"
        className="w-full max-w-[400px] flex-1 pb-8 max-sm:pb-[120px]"
      >
        <DataProvider>
          <WelcomeGuard>{children}</WelcomeGuard>
        </DataProvider>
      </main>
      <footer className="flex h-16 flex-none items-center justify-center gap-2 max-sm:hidden">
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
