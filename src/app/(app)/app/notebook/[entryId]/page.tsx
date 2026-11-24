import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Notebook' };

/** `params` is a Promise in this Next.js; the layout's view reads the note's id from the address. */
export default async function NotebookEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  await params;
  return null;
}
