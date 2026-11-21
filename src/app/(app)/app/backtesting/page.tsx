import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Backtesting' };

export default function BacktestingPage() {
  return <ModulePlaceholder module="backtesting" />;
}
