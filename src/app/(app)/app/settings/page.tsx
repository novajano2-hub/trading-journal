import type { Metadata } from 'next';
import { ModulePlaceholder } from '@/components/app/module-placeholder';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return <ModulePlaceholder module="settings" />;
}
