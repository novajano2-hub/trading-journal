import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProgressView } from '@/components/app/progress/progress-view';
import { ProgressSkeleton } from '@/components/app/progress/states';

export const metadata: Metadata = { title: 'Progress tracker' };

/** Static: the skeleton prerenders, and the view fills in on the client once it reads the URL. */
export default function ProgressPage() {
  return (
    <Suspense fallback={<ProgressSkeleton />}>
      <ProgressView />
    </Suspense>
  );
}
