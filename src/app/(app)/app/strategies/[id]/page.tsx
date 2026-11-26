import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StrategyView } from '@/components/app/strategies/strategy-view';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';
import { decodedSegment } from '@/lib/route-param';

export const metadata: Metadata = { title: 'Strategy' };

/** `params` is a Promise in this Next.js: the view fills in on the client from the local data. */
export default async function StrategyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={<StrategySkeleton label="Loading the strategy" rows={2} />}
    >
      <StrategyView id={decodedSegment(id)} />
    </Suspense>
  );
}
