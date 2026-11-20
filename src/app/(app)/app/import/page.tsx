'use client';

import Link from 'next/link';
import { ArrowLeft, FileText, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BadgeLogo } from '@/components/marketing/badge-logo';
import { clearPendingImport, loadPendingImport } from '@/lib/pending-import';

type Waiting =
  | { kind: 'checking' }
  | { kind: 'file'; name: string; size: number }
  | { kind: 'none' };

const ICON = { 'aria-hidden': true, strokeWidth: 1.75 } as const;

function kb(bytes: number): string {
  return (bytes / 1024).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// Placeholder until column mapping lands with the import release.
export default function ImportPage() {
  const [waiting, setWaiting] = useState<Waiting>({ kind: 'checking' });
  const noneRef = useRef<HTMLParagraphElement>(null);
  const removed = useRef(false);

  useEffect(() => {
    let live = true;
    loadPendingImport()
      .then((file) => {
        if (!live) return;
        setWaiting(
          file instanceof Blob && 'name' in file
            ? { kind: 'file', name: file.name, size: file.size }
            : { kind: 'none' },
        );
      })
      .catch(() => live && setWaiting({ kind: 'none' }));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (waiting.kind === 'none' && removed.current) noneRef.current?.focus();
  }, [waiting]);

  async function remove() {
    await clearPendingImport();
    removed.current = true;
    setWaiting({ kind: 'none' });
  }

  return (
    <main className="flex flex-1 flex-col px-4 pt-6 pb-16 md:px-14">
      <BadgeLogo />
      <div className="mt-14 max-w-[640px] md:mt-20">
        <h1 className="font-display text-[clamp(3rem,8vw,5.5rem)] leading-[0.88] font-black tracking-[-0.01em] uppercase">
          Import
        </h1>

        <div
          aria-live="polite"
          className="ticket-stock mt-8 rounded-[3px] px-5 pt-4 pb-5 md:px-6"
        >
          <p className="border-b-[1.5px] border-ink pb-2 text-[11px] leading-none font-bold tracking-[0.2em] uppercase">
            Waiting to be filed
          </p>
          {waiting.kind === 'checking' ? (
            <p className="mt-4 text-[17px] font-medium">
              Checking this browser for your file…
            </p>
          ) : waiting.kind === 'file' ? (
            <>
              <p className="mt-4 flex items-start gap-3 text-[17px] leading-snug font-medium">
                <FileText {...ICON} className="mt-0.5 size-6 shrink-0" />
                <span>
                  Received{' '}
                  <strong className="font-semibold">{waiting.name}</strong> (
                  {kb(waiting.size)} KB), stored only in this browser.
                </span>
              </p>
              <p className="mt-2 pl-9 text-[15px] leading-snug text-ink/75">
                Column mapping opens with the import release.
              </p>
              <button
                type="button"
                onClick={remove}
                className="mt-5 ml-9 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded border-2 border-ink px-4 font-display text-lg font-bold tracking-[0.06em] uppercase hover:bg-ink hover:text-stock"
              >
                <Trash2 {...ICON} className="size-5" />
                Remove file
              </button>
            </>
          ) : (
            <>
              <p
                ref={noneRef}
                tabIndex={-1}
                className="mt-4 text-[17px] font-medium"
              >
                No file waiting.
              </p>
              <Link
                href="/#drop"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-ink underline"
              >
                <ArrowLeft {...ICON} className="size-4" />
                Drop a CSV on the home page
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
