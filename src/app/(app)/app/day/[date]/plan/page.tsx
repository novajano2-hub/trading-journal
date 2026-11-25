import type { Metadata } from 'next';
import { DayView } from '@/components/app/day/day-view';

export const metadata: Metadata = { title: 'Day plan' };

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** `params` is a Promise in this Next.js. */
export default async function DayPlanPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <DayView date={decoded(date)} mode="plan" />;
}
