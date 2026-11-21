import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DashboardView } from '@/components/app/dashboard/dashboard-view';
import { DashboardSkeleton } from '@/components/app/dashboard/states';

export const metadata: Metadata = { title: 'Dashboard' };

/** Static: the skeleton prerenders, and the view fills in on the client once it reads the URL. */
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardView />
    </Suspense>
  );
}
