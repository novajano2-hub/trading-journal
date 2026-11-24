import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ManualTradeForm } from '@/components/app/trades/manual-trade-form';

export const metadata: Metadata = { title: 'Edit trade' };

/** Next hands the segment over percent-encoded (an id like `a:b` arrives as `a%3Ab`). */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** `params` is a Promise in this Next.js. */
export default async function EditTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ManualTradeForm tradeId={decoded(id)} />
    </Suspense>
  );
}
