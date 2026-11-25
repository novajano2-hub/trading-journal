import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TradesWeekView } from '@/components/app/trades/log/week-view';

export const metadata: Metadata = { title: 'Trades by week' };

/** Static: the view fills in on the client once it reads the URL. */
export default function TradesWeekPage() {
  return (
    <Suspense fallback={null}>
      <TradesWeekView />
    </Suspense>
  );
}
