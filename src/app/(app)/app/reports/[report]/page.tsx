import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportsPage } from '@/components/app/reports/reports-shell';
import {
  isReportKey,
  REPORT_KEYS,
  REPORT_LABELS,
} from '@/components/app/reports/report-keys';

/** `params` is a Promise in this Next.js. */
type Props = { params: Promise<{ report: string }> };

export function generateStaticParams() {
  return REPORT_KEYS.map((report) => ({ report }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { report } = await params;
  return {
    title: isReportKey(report) ? `${REPORT_LABELS[report]} report` : 'Reports',
  };
}

export default async function Page({ params }: Props) {
  const { report } = await params;
  if (!isReportKey(report)) notFound();
  return <ReportsPage report={report} />;
}
