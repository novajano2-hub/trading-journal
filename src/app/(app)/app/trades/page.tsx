import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TradesView } from '@/components/app/trades/trades-view';

export const metadata: Metadata = { title: 'Trades' };

/** Static: the view fills in on the client once it reads the URL. */
export default function TradesPage() {
  return (
    <Suspense fallback={null}>
      <TradesView />
    </Suspense>
  );
}
