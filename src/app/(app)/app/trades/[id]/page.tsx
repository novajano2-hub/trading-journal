import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TradeView } from '@/components/app/trades/trade-view';

export const metadata: Metadata = { title: 'Trade' };

/** Next hands the segment over percent-encoded (an id like `a:b` arrives as `a%3Ab`). */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** `params` is a Promise in this Next.js: the view fills in on the client once it reads the URL. */
export default async function TradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <TradeView id={decoded(id)} />
    </Suspense>
  );
}
