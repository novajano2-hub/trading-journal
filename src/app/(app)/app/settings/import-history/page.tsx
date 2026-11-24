import type { Metadata } from 'next';
import { ImportHistory } from '@/components/app/settings/import-history';

export const metadata: Metadata = { title: 'Import history' };

export default function ImportHistoryPage() {
  return <ImportHistory />;
}
