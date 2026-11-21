import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Notebook' };

export default function NotebookPage() {
  return <ModulePlaceholder module="notebook" />;
}
