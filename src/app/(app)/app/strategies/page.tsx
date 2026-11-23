import type { Metadata } from 'next';
import { StrategiesView } from '@/components/app/strategies/strategies-view';

export const metadata: Metadata = { title: 'Strategies' };

export default function StrategiesPage() {
  return <StrategiesView />;
}
