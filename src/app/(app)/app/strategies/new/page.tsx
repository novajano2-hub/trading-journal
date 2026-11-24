import type { Metadata } from 'next';
import { StrategyForm } from '@/components/app/strategies/strategy-form';

export const metadata: Metadata = { title: 'New strategy' };

export default function NewStrategyPage() {
  return <StrategyForm />;
}
