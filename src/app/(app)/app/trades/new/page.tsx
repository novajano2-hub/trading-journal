import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ManualTradeForm } from '@/components/app/trades/manual-trade-form';

export const metadata: Metadata = { title: 'Add a trade' };

/** Static: the form fills in on the client once the data is read. */
export default function NewTradePage() {
  return (
    <Suspense fallback={null}>
      <ManualTradeForm />
    </Suspense>
  );
}
