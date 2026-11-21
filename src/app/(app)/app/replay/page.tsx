import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Replay' };

export default function ReplayPage() {
  return <ModulePlaceholder module="replay" />;
}
