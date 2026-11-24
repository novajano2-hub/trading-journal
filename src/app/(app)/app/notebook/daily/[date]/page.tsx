import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Daily note' };

/**
 * `params` is a Promise in this Next.js. The layout's view opens or makes the
 * day's note, and says so for a date that isn't one.
 */
export default async function NotebookDailyPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  await params;
  return null;
}
