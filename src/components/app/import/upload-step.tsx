'use client';

import {
  ArrowRight,
  FileCsv,
  FileXls,
  Trash,
  UploadSimple,
  Warning,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { StateGlyph } from '@/components/ui/state-glyph';
import { buttonClasses } from '@/components/ui/button-styles';
import type { ImportFile } from '@/lib/decode';
import { CARD, CARD_PAD } from '@/components/app/dashboard/shared';
import { CARD_TITLE } from './styles';

const ICON = { 'aria-hidden': true } as const;

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return kb < 1024
    ? `${kb.toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} KB`
    : `${(kb / 1024).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB`;
}

/** The file's one-line summary: rows, columns and size. */
export function fileSummary(file: ImportFile): string {
  const rows = file.parsed.rows.length;
  const cols = file.parsed.headers.length;
  return `${rows.toLocaleString('en-US')} ${rows === 1 ? 'row' : 'rows'}, ${cols} ${cols === 1 ? 'column' : 'columns'}, ${fileSize(file.size)}`;
}

/** Step 1: a drop zone and a file picker for CSV, TXT and XLSX, and the chosen file's chip. */
export function UploadStep({
  file,
  reading,
  error,
  onFile,
  onRemove,
  onContinue,
}: {
  file: ImportFile | null;
  reading: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
  onContinue: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const Glyph = file?.kind === 'xlsx' ? FileXls : FileCsv;

  return (
    <section
      className={`${CARD} ${CARD_PAD} max-w-[760px]`}
      aria-labelledby={`${inputId}-h`}
    >
      <h2 id={`${inputId}-h`} className={CARD_TITLE}>
        Upload your trades
      </h2>
      <p className="mt-1 text-[13.5px] leading-snug text-muted">
        One file from your broker: executions (a row per fill) or trade history
        (a row per closed trade).
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) onFile(dropped);
        }}
        className={`mt-4 flex flex-col items-center rounded-card border border-dashed px-6 py-10 text-center transition-colors duration-200 ${over ? 'border-accent bg-accent-soft/40' : 'border-line-2'}`}
      >
        <StateGlyph icon={UploadSimple} />
        <p className="mt-4 text-[15px] font-semibold text-text">
          Drop a file here
        </p>
        <p className="mt-1 text-[13px] text-muted">
          CSV, TXT or XLSX. The file is read in this browser and goes nowhere
          else.
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,.txt,.xlsx"
          aria-label="Import file"
          className="sr-only"
          onChange={(e) => {
            const chosen = e.target.files?.[0];
            if (chosen) onFile(chosen);
            // The same file chosen again must still fire a change.
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`${buttonClasses('secondary')} mt-5`}
        >
          Choose a file
        </button>
      </div>

      <p className="mt-3 text-[13px] text-muted">
        Not sure where to find it?{' '}
        <Link
          href="/brokers#export"
          className="font-semibold text-accent-ink hover:underline"
        >
          How to export your CSV
        </Link>
      </p>

      <div aria-live="polite">
        {reading ? (
          <p role="status" className="mt-4 text-[13.5px] text-muted">
            Reading the file...
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 flex items-start gap-2.5 rounded-control bg-sunken px-3.5 py-3 text-[13.5px] leading-snug font-medium text-text">
            <Warning
              {...ICON}
              size={18}
              className="mt-px shrink-0 text-muted"
            />
            {error}
          </p>
        ) : null}
      </div>

      {file ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control border border-line px-3.5 py-3">
          <Glyph
            size={18}
            aria-hidden="true"
            className="flex-none text-muted"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-text">
              {file.name}
            </p>
            <p className="text-[12px] text-faint">{fileSummary(file)}</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className={buttonClasses('ghost', 'sm')}
          >
            <Trash {...ICON} size={16} />
            Remove file
          </button>
        </div>
      ) : null}

      <div className="mt-5 flex justify-end border-t border-line pt-4">
        <button
          type="button"
          disabled={!file}
          onClick={onContinue}
          className={`${buttonClasses('primary')} disabled:cursor-default disabled:opacity-45`}
        >
          Map columns
          <ArrowRight {...ICON} size={16} />
        </button>
      </div>
    </section>
  );
}
