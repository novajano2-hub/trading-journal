import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StrategyView } from '@/components/app/strategies/strategy-view';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';

export const metadata: Metadata = { title: 'Strategy' };

/** Next hands the segment over percent-encoded. */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

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
      <StrategyView id={decoded(id)} />
    </Suspense>
  );
}
