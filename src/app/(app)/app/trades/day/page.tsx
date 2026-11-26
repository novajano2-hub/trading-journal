import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TradesDayPageView } from '@/components/app/trades/log/log-pages';

export const metadata: Metadata = { title: 'Trades by day' };

/** Static: the view fills in on the client once it reads the URL. */
export default function TradesDayPage() {
  return (
    <Suspense fallback={null}>
      <TradesDayPageView />
    </Suspense>
  );
}
