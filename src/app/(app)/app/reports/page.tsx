import type { Metadata } from 'next';
import { ReportsPage } from '@/components/app/reports/reports-shell';

export const metadata: Metadata = { title: 'Reports' };

/** Static: the skeleton prerenders, and the report fills in on the client once it reads the URL. */
export default function Page() {
  return <ReportsPage report="overview" />;
}
