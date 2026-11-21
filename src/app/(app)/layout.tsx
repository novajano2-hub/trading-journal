import type { Metadata } from 'next';
import { Instrument_Sans } from 'next/font/google';
import { AppShell } from '@/components/app/app-shell';
import { DataProvider } from '@/data/query/provider';

export const metadata: Metadata = { robots: { index: false } };

// The app's one family; loaded here so marketing pages never fetch it.
const appSans = Instrument_Sans({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
});

/*
 * `[data-surface='app']` switches theme.css to the app's tokens on <html> via
 * :has(), so portals and the page ground follow. The face is set the same way:
 * next/font scopes its variable to a class, which a portal would sit outside.
 */
const appFace = `:root:has([data-surface='app']){--font-app-sans:${appSans.style.fontFamily}}`;

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-surface="app" className="flex flex-1 flex-col">
      <style href="keel-app-face" precedence="default">
        {appFace}
      </style>
      <DataProvider>
        <AppShell>{children}</AppShell>
      </DataProvider>
    </div>
  );
}
