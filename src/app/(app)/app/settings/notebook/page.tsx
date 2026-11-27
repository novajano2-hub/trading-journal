import type { Metadata } from 'next';
import { NotebookSettings } from '@/components/app/settings/notebook-settings';

export const metadata: Metadata = { title: 'Notebook settings' };

export default function NotebookSettingsPage() {
  return <NotebookSettings />;
}
