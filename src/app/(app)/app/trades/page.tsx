import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Trades' };

export default function TradesPage() {
  return <ModulePlaceholder module="trades" />;
}
