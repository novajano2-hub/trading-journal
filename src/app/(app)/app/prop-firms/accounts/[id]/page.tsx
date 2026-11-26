import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ChallengeDetails } from '@/components/app/prop/challenge-details';
import { StrategySkeleton } from '@/components/app/strategies/strategy-states';
import { decodedSegment } from '@/lib/route-param';

export const metadata: Metadata = { title: 'Challenge details' };

/**
 * A challenge's details. `params` is a Promise in this Next.js; the view fills
 * in on the client from the local data, and reads the phase from the address
 * (`?phase=`), so it waits inside a Suspense boundary.
 */
export default async function ChallengeDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense
      fallback={<StrategySkeleton label="Loading the challenge" rows={3} />}
    >
      <ChallengeDetails id={decodedSegment(id)} />
    </Suspense>
  );
}
