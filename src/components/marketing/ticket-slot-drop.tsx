'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileCheck2, FileUp, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { PreviewTicket } from '@/domain/import/preview';
import { previewFile } from '@/lib/import/preview-file';
import type { TicketModel } from '@/lib/landing/sample-view';
import { savePendingImport } from '@/lib/pending-import';
import { TicketStack } from './ticket-stack';

const ACCEPT = '.csv,text/csv,text/plain';
const READ_ERROR =
  "We couldn't read that file. Export your trades as CSV and try again.";
const EMPTY_ERROR = "We couldn't find any trades in that file.";
const SAVE_ERROR =
  "We couldn't keep that file in this browser. Allow site storage and try again.";

type Printed = { file: File; tickets: PreviewTicket[]; run: number };

const hasValue = (t: PreviewTicket) =>
  Object.values(t).some((v) => typeof v === 'string' && v.trim() !== '');

const hasFiles = (e: DragEvent) =>
  Array.from(e.dataTransfer?.types ?? []).includes('Files');

const ICON = { 'aria-hidden': true, strokeWidth: 1.75 } as const;

/**
 * The navy ticket slot. A visitor's CSV is read in the browser, its first fills
 * print into the stack as their own tickets, and the file waits for /app/import.
 */
export function TicketSlotDrop({ sample }: { sample: TicketModel[] }) {
  const router = useRouter();
  const [printed, setPrinted] = useState<Printed | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const latest = useRef(0);
  const stackRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const goId = useId();
  const hintId = useId();

  async function read(file: File) {
    const run = ++latest.current;
    setError(null);
    setReading(file.name);
    let tickets: PreviewTicket[] | null = null;
    let problem: string | null = null;
    try {
      tickets = (await previewFile(file)).tickets.filter(hasValue);
      if (tickets.length === 0) problem = EMPTY_ERROR;
    } catch {
      problem = READ_ERROR;
    }
    if (run !== latest.current) return; // a newer file took over
    setReading(null);
    if (problem || !tickets) setError(problem ?? READ_ERROR);
    else setPrinted({ file, tickets, run });
  }

  // Files dropped anywhere on the page land in the slot instead of replacing the page.
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setOver(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer?.files[0];
      if (file) void readRef.current(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const el = stackRef.current;
    if (!printed || !el) return;
    // Printing replaced the slot that held focus: hand it to the next action.
    const active = document.activeElement;
    if (!active || active === document.body)
      continueRef.current?.focus({ preventScroll: true });
    // On phones the stack sits below the slot: bring the fresh tickets into view.
    if (el.getBoundingClientRect().bottom <= innerHeight) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'end', behavior: still ? 'auto' : 'smooth' });
  }, [printed]);

  const onChoose = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // choosing the same file again should still print
    if (file) void read(file);
  };

  async function onContinue() {
    if (!printed) return;
    setSaving(true);
    setError(null);
    try {
      await savePendingImport(printed.file);
      router.push('/app/import');
    } catch {
      setSaving(false);
      setError(SAVE_ERROR);
    }
  }

  const input = (
    <input
      type="file"
      accept={ACCEPT}
      onChange={onChoose}
      className="sr-only"
      {...(printed
        ? {}
        : {
            'aria-labelledby': `${titleId} ${goId}`,
            'aria-describedby': hintId,
          })}
    />
  );

  const mouth = (
    <span
      aria-hidden="true"
      className={`slot-mouth block h-2.5 rounded-[5px] ${over || printed ? 'slot-mouth-fed' : ''}`}
    />
  );

  return (
    <>
      <div
        id="drop"
        className="mt-7 scroll-mt-6 [grid-area:drop] md:mt-10 xl:mt-[88px]"
      >
        {printed ? (
          <div
            data-surface="navy"
            className="slot rounded-md bg-navy px-5 pt-5 pb-4 text-stock md:px-6 md:pt-[22px] md:pb-[18px]"
          >
            {mouth}
            <div className="mt-[18px] flex min-w-0 items-center gap-4 md:gap-[18px]">
              <FileCheck2 {...ICON} className="size-9 shrink-0 md:size-10" />
              <span className="min-w-0">
                <strong className="block truncate text-lg leading-snug font-semibold md:text-xl">
                  {printed.file.name}
                </strong>
                <span className="block text-[15px] leading-snug text-stock/75">
                  {printed.tickets.length === 1
                    ? 'Its first fill is printed as a ticket.'
                    : `Its first ${printed.tickets.length} fills are printed as tickets.`}{' '}
                  Check them, then map your columns.
                </span>
              </span>
            </div>
            <div className="mt-4 flex flex-col-reverse gap-2 md:mt-[18px] md:flex-row md:items-center md:justify-between md:gap-6">
              <label className="inline-flex min-h-11 cursor-pointer items-center self-start text-[15px] font-semibold text-stock underline decoration-stock/50 decoration-[1.5px] underline-offset-[0.2em] hover:decoration-stock has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-gold has-[input:focus-visible]:outline-solid md:self-auto">
                Choose a different file
                {input}
              </label>
              <button
                ref={continueRef}
                type="button"
                onClick={onContinue}
                disabled={saving}
                aria-busy={saving}
                className="slot-go inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded px-5 py-3 font-display text-[22px] leading-none font-black tracking-[0.05em] whitespace-nowrap text-navy uppercase disabled:cursor-progress"
              >
                Map columns and continue
              </button>
            </div>
          </div>
        ) : (
          <label
            data-surface="navy"
            data-over={over || undefined}
            aria-busy={reading ? true : undefined}
            className="slot slot-drop group block cursor-pointer rounded-md bg-navy px-5 pt-5 pb-5 text-stock md:px-6 md:pt-[22px] md:pb-[22px]"
          >
            {mouth}
            <span className="mt-[18px] flex flex-col gap-4 md:flex-row md:items-center md:gap-[18px]">
              <span className="flex min-w-0 items-center gap-4 md:gap-[18px]">
                <FileUp {...ICON} className="size-9 shrink-0 md:size-10" />
                <span className="min-w-0">
                  <strong
                    id={titleId}
                    className="block text-lg leading-snug font-semibold md:text-xl"
                  >
                    {reading
                      ? `Reading ${reading}`
                      : over
                        ? 'Release to print your tickets'
                        : 'Drop your broker CSV here'}
                  </strong>
                  <span
                    id={hintId}
                    className="block text-[15px] leading-snug text-stock/75"
                  >
                    Or choose a file. It stays in this browser.
                  </span>
                </span>
              </span>
              <span
                id={goId}
                className="slot-go inline-flex min-h-12 shrink-0 items-center justify-center rounded px-5 py-3 font-display text-[22px] leading-none font-black tracking-[0.05em] whitespace-nowrap text-navy uppercase md:ml-auto"
              >
                Build my journal
              </span>
            </span>
            {input}
          </label>
        )}
      </div>

      <div className="[grid-area:note]">
        {error ? (
          <p
            role="alert"
            className="mt-4 flex items-start gap-3 rounded bg-stock px-4 py-3 text-[15px] leading-snug font-semibold text-ink shadow-[0_1px_2px_rgba(21,26,45,0.2),0_10px_20px_-12px_rgba(21,26,45,0.5)]"
          >
            <TriangleAlert
              {...ICON}
              className="mt-px size-5 shrink-0 text-sell"
            />
            {error}
          </p>
        ) : null}
        <p className="mt-5 text-[15px] leading-normal font-medium md:mt-8">
          Any CSV with time, symbol, side, quantity and price works.{' '}
          <Link
            href="/brokers#export"
            className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-ink underline"
          >
            How to export
            <ArrowRight {...ICON} className="size-4" />
          </Link>
        </p>
        <p role="status" className="sr-only">
          {printed
            ? `Printed ${printed.tickets.length} tickets from ${printed.file.name}.`
            : ''}
        </p>
      </div>

      <div
        ref={stackRef}
        className="mt-12 self-start [grid-area:stack] xl:mt-0 xl:justify-self-end"
      >
        {printed ? (
          <TicketStack
            key={printed.run}
            variant="yours"
            tickets={printed.tickets}
          />
        ) : (
          <TicketStack variant="sample" tickets={sample} />
        )}
      </div>
    </>
  );
}
