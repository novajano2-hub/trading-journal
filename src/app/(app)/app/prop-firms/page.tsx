import type { Metadata } from 'next';
import { PropView } from '@/components/app/prop/prop-view';

export const metadata: Metadata = { title: 'Prop firms' };

export default function PropFirmsPage() {
  return <PropView />;
}
