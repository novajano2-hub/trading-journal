import type { Metadata } from 'next';
import { AppShell } from '@/components/app/app-shell';
import { DataProvider } from '@/data/query/provider';

export const metadata: Metadata = { robots: { index: false } };

export default function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DataProvider>
      <AppShell>{children}</AppShell>
    </DataProvider>
  );
}
