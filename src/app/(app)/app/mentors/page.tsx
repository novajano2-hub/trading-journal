import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Mentors' };

export default function MentorsPage() {
  return <ModulePlaceholder module="mentors" />;
}
