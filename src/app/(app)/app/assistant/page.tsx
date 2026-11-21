import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Assistant' };

export default function AssistantPage() {
  return <ModulePlaceholder module="assistant" />;
}
