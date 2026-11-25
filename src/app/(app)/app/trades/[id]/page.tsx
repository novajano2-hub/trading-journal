import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TradeView } from '@/components/app/trades/trade-view';
import { decodedSegment } from '@/lib/route-param';

export const metadata: Metadata = { title: 'Trade' };

/** `params` is a Promise in this Next.js: the view fills in on the client once it reads the URL. */
export default async function TradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TradeView id={decodedSegment(id)} />
    </Suspense>
  );
}
