import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Reports' };

export default function ReportsPage() {
  return <ModulePlaceholder module="reports" />;
}
