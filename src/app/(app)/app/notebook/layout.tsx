import { NotebookView } from '@/components/app/notebook/notebook-view';

/**
 * The Notebook's folders, list and open note stay mounted while a note or a
 * day opens, so the folder and the search survive it. The pages under it name
 * the note; the view reads it from the address.
 */
export default function NotebookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <NotebookView />
      {children}
    </>
  );
}
