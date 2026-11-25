import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TradesWeekPageView } from '@/components/app/trades/log/log-pages';

export const metadata: Metadata = { title: 'Trades by week' };

/** Static: the view fills in on the client once it reads the URL. */
export default function TradesWeekPage() {
  return (
    <Suspense fallback={null}>
      <TradesWeekPageView />
    </Suspense>
  );
}
