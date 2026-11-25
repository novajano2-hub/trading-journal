import type { Metadata } from 'next';
import { DayRedirect } from '@/components/app/day/day-view';

export const metadata: Metadata = { title: 'Day' };

/** Next hands the segment over percent-encoded. */
function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** `params` is a Promise in this Next.js. The bare date picks plan or review on the client, once the routine's today is known. */
export default async function DayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  return <DayRedirect date={decoded(date)} />;
}
