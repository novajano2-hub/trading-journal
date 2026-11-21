import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Prop firms' };

export default function PropFirmsPage() {
  return <ModulePlaceholder module="prop-firms" />;
}
