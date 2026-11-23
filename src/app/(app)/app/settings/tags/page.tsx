import type { Metadata } from 'next';
import { TagsSettings } from '@/components/app/settings/tags';

export const metadata: Metadata = { title: 'Tags settings' };

export default function TagsSettingsPage() {
  return <TagsSettings />;
}
