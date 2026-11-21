'use client';

import {
  ArrowLeft,
  FileText,
  Trash,
  UploadSimple,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DashboardLink } from '@/components/app/dashboard-link';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import { clearPendingImport, loadPendingImport } from '@/lib/pending-import';

type Waiting =
  | { kind: 'checking' }
  | { kind: 'file'; name: string; size: number }
  | { kind: 'none' };

const ICON = { 'aria-hidden': true } as const;

/** Where an import starts until Keel takes files itself: getting the CSV out of the broker. */
const EXPORT_GUIDE = '/brokers#export';

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
  const noneRef = useRef<HTMLHeadingElement>(null);
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
    // The app shell's top bar carries the page title.
    <div className="w-full px-5 pt-6 pb-16">
      <div className="max-w-[640px]">
        <div className="rounded-card border border-line bg-surface-1 p-6 shadow-[var(--shadow-card)]">
          {/* With no file the empty state's own title heads the card. */}
          {waiting.kind === 'none' ? null : (
            <h2 className="border-b border-line pb-3 text-[13px] font-medium text-muted">
              Waiting to be imported
            </h2>
          )}
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
              // The app's empty state: the module's tile, what's missing, what to bring, the way on.
              <div className="flex flex-col items-center px-2 pt-6 pb-3 text-center sm:px-6">
                <IconTile
                  icon={UploadSimple}
                  tone="accent"
                  className="size-10! rounded-[11px]! [&_svg]:size-[22px]"
                />
                <h2
                  ref={noneRef}
                  tabIndex={-1}
                  className="mt-5 text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance text-text focus-visible:outline-offset-4"
                >
                  No file waiting.
                </h2>
                <p className="mt-2 text-[14.5px] leading-[1.6] text-pretty text-muted">
                  Bring in trades from your broker&apos;s CSV export.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                  <Link
                    href={EXPORT_GUIDE}
                    className={buttonClasses('primary')}
                  >
                    How to export your CSV
                  </Link>
                  {/* Styled as the placeholders' way back. */}
                  <DashboardLink className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-[14px] font-semibold text-accent-ink no-underline hover:underline">
                    <ArrowLeft {...ICON} size={16} />
                    Back to the Dashboard
                  </DashboardLink>
                </div>
              </div>
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
    </div>
  );
}
