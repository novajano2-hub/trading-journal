import type { Metadata } from 'next';
import { AppShell } from '@/components/app/app-shell';
import { DataProvider } from '@/data/query/provider';

export const metadata: Metadata = { robots: { index: false } };

/*
 * `[data-surface='app']` switches theme.css to the app's tokens on <html> via
 * :has(), so Radix portals and the page ground follow it.
 */
export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-surface="app" className="flex flex-1 flex-col">
      <DataProvider>
        <AppShell>{children}</AppShell>
      </DataProvider>
    </div>
  );
}
