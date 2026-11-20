'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Trash,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/site/brand-mark';
import { clearPendingImport, loadPendingImport } from '@/lib/pending-import';

type Waiting =
  | { kind: 'checking' }
  | { kind: 'file'; name: string; size: number }
  | { kind: 'none' };

const ICON = { 'aria-hidden': true } as const;

const REMOVE_ERROR =
  "Couldn't remove the file from this browser. Try again, or clear this site's data in your browser settings.";

function kb(bytes: number): string {
  return (bytes / 1024).toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// Placeholder until column mapping lands with the import release.
export default function ImportPage() {
  const [waiting, setWaiting] = useState<Waiting>({ kind: 'checking' });
  const [removeError, setRemoveError] = useState(false);
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
    setRemoveError(false);
    try {
      await clearPendingImport();
    } catch {
      // The file is still in the browser: keep showing it, and say how to get out.
      setRemoveError(true);
      return;
    }
    removed.current = true;
    setWaiting({ kind: 'none' });
  }

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col px-5 pt-6 pb-16 sm:px-10">
      <BrandMark />
      <div className="mt-14 max-w-[640px] md:mt-20">
        <h1 className="text-[clamp(36px,calc(2.6vw+16px),52px)] leading-[1.06] font-semibold tracking-[-0.04em] motion-safe:animate-rise">
          Import
        </h1>

        <div className="mt-8 rounded-card border border-line bg-surface-1 p-6 shadow-[var(--shadow)]">
          <h2 className="border-b border-line pb-3 text-[13px] font-medium text-muted">
            Waiting to be filed
          </h2>
          <div aria-live="polite">
            {waiting.kind === 'checking' ? (
              <p className="mt-4 text-[16px] text-muted">
                Checking this browser for your file…
              </p>
            ) : waiting.kind === 'file' ? (
              <>
                <p className="mt-4 flex items-start gap-3 text-[16px] leading-snug">
                  <FileText
                    {...ICON}
                    size={24}
                    className="mt-px shrink-0 text-muted"
                  />
                  <span>
                    Received{' '}
                    <strong className="font-semibold">{waiting.name}</strong> (
                    <span className="font-mono">{kb(waiting.size)} KB</span>),
                    stored only in this browser.
                  </span>
                </p>
                <p className="mt-2 pl-9 text-[14.5px] leading-snug text-muted">
                  Column mapping opens with the import release.
                </p>
                <button
                  type="button"
                  onClick={remove}
                  className="mt-5 ml-9 inline-flex h-11 cursor-pointer items-center gap-2 rounded-control border border-line-2 bg-surface-1 px-[18px] text-[15px] font-medium transition-colors hover:border-faint"
                >
                  <Trash {...ICON} size={18} />
                  Remove file
                </button>
              </>
            ) : (
              <>
                <p
                  ref={noneRef}
                  tabIndex={-1}
                  className="mt-4 text-[16px] focus-visible:outline-offset-4"
                >
                  No file waiting.
                </p>
                <Link
                  href="/"
                  className="mt-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-accent-ink"
                >
                  <ArrowLeft {...ICON} size={16} />
                  Back to the home page
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Outside the polite region above, so the alert is announced once. */}
        {removeError && waiting.kind === 'file' ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-control border border-line bg-loss-soft px-4 py-3 text-[14.5px] leading-snug font-medium text-text"
          >
            <Warning {...ICON} size={20} className="mt-px shrink-0 text-loss" />
            {REMOVE_ERROR}
          </p>
        ) : null}
      </div>
    </main>
  );
}
