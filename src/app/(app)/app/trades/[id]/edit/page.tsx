import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ManualTradeForm } from '@/components/app/trades/manual-trade-form';
import { decodedSegment } from '@/lib/route-param';

export const metadata: Metadata = { title: 'Edit trade' };

/** `params` is a Promise in this Next.js. */
export default async function EditTradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ManualTradeForm tradeId={decodedSegment(id)} />
    </Suspense>
  );
}
