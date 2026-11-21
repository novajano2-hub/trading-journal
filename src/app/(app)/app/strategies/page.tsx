import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Strategies' };

export default function StrategiesPage() {
  return <ModulePlaceholder module="strategies" />;
}
