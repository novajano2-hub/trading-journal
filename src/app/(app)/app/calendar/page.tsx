import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Calendar' };

export default function CalendarPage() {
  return <ModulePlaceholder module="calendar" />;
}
