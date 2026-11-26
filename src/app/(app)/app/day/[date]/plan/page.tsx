import type { Metadata } from 'next';
import { DayView } from '@/components/app/day/day-view';
import { decodedSegment } from '@/lib/route-param';

export const metadata: Metadata = { title: 'Day plan' };

/** `params` is a Promise in this Next.js. */
export default async function DayPlanPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <DayView date={decodedSegment(date)} mode="plan" />;
}
