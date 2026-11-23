'use client';

import { Check } from '@phosphor-icons/react/dist/ssr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CARD } from '@/components/app/dashboard/shared';
import { usePrefs, useUserAccounts } from '@/data/query/hooks';
import type { ImportJob } from '@/domain/types';
import { missingFields } from '@/domain/import/mapping';
import { ImportFileError, readImportFile, type ImportFile } from '@/lib/decode';
import { clearPendingImport, loadPendingImport } from '@/lib/pending-import';
import { ImportDone } from './confirm-step';
import { MapStep } from './map-step';
import { openMapState, type MapState } from './mapping-state';
import { PreviewStep } from './preview-step';
import { UploadStep, fileSummary } from './upload-step';
import { IconTile } from '@/components/ui/icon-tile';
import { FileCsv, FileXls } from '@phosphor-icons/react/dist/ssr';

export const STEPS = ['upload', 'map', 'preview', 'confirm'] as const;
export type Step = (typeof STEPS)[number];

const STEP_NAME: Record<Step, string> = {
  upload: 'Upload',
  map: 'Map columns',
  preview: 'Preview',
  confirm: 'Confirm',
};

const isStep = (s: string | null): s is Step => STEPS.includes(s as Step);

/**
 * The import, step by step. The step is in the address bar (`?step=`), so Back
 * works; the file and its mapping are held here, and Preview and Confirm are
 * out of reach until the mapping has every required field and an account.
 */
export function ImportFlow() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const [file, setFile] = useState<ImportFile | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [mapState, setMapState] = useState<MapState | null>(null);
  const [save, setSave] = useState(true);
  /** Preview's "Set point values" asked Map to put the cursor in the first point value. */
  const [focusPoint, setFocusPoint] = useState(false);
  /** The import that was written; Confirm shows it. */
  const [done, setDone] = useState<ImportJob | null>(null);

  const accountsQuery = useUserAccounts();
  const prefs = usePrefs().data;
  const accounts = (accountsQuery.data ?? []).filter(
    (a) => a.status === 'active',
  );

  // Adjusting state while rendering: the first account is chosen once they are known.
  if (accountId === null && accountsQuery.data && accounts[0])
    setAccountId(accounts[0].id);

  // The mapping opens once for each file and account (saved mapping, else Keel's guess).
  const account = accounts.find((a) => a.id === accountId);
  const key =
    file && prefs && accountsQuery.data
      ? `${file.id}:${accountId ?? ''}`
      : null;
  if (key && file && prefs && mapState?.key !== key)
    setMapState(openMapState(key, file.parsed, account, prefs.timeZone));

  const requested = params.get('step');
  const wanted: Step = isStep(requested) ? requested : 'upload';
  const ready =
    mapState !== null &&
    accountId !== null &&
    missingFields(mapState.mapping).length === 0;
  const step: Step =
    wanted === 'upload' || !file
      ? 'upload'
      : wanted === 'map' || !ready
        ? 'map'
        : wanted === 'confirm' && !done
          ? 'preview'
          : wanted;

  const go = useCallback(
    (to: Step, how: 'push' | 'replace' = 'push') => {
      const next = new URLSearchParams(window.location.search);
      next.set('step', to);
      router[how](`${pathname}?${next}`);
    },
    [pathname, router],
  );

  // A step the flow can't show yet is replaced in the address bar, not left to lie.
  // While the pending file is still being looked for, the URL is left alone.
  useEffect(() => {
    if (!checking && requested !== null && step !== wanted) go(step, 'replace');
  }, [checking, requested, step, wanted, go]);

  const open = useCallback(
    async (chosen: File, then?: 'map') => {
      setReading(true);
      setError(null);
      try {
        const opened = await readImportFile(chosen);
        setFile(opened);
        setMapState(null);
        setDone(null);
        if (then) go(then, 'replace');
      } catch (e) {
        setFile(null);
        setError(
          e instanceof ImportFileError
            ? e.message
            : "Keel couldn't read this file. Try another one.",
        );
      } finally {
        setReading(false);
      }
    },
    [go],
  );

  // A file handed over from the landing page opens straight into the flow.
  const looked = useRef(false);
  useEffect(() => {
    if (looked.current) return;
    looked.current = true;
    loadPendingImport()
      .then((pending) => {
        if (pending) return open(pending, 'map');
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [open]);

  // An account made on Map is chosen with the mapping as it stands: a new account has no saved one.
  function accountCreated(id: string) {
    setAccountId(id);
    setMapState((s) => (s && file ? { ...s, key: `${file.id}:${id}` } : s));
  }

  const focused = useCallback(() => setFocusPoint(false), []);

  async function choose(chosen: File) {
    // A new file replaces the one waiting in this browser.
    clearPendingImport().catch(() => undefined);
    await open(chosen);
  }

  function remove() {
    clearPendingImport().catch(() => undefined);
    setFile(null);
    setMapState(null);
    setDone(null);
    setError(null);
    go('upload', 'replace');
  }

  return (
    <div className="grid gap-4">
      <Stepper step={step} file={file} ready={ready} onGo={go} />
      {step === 'upload' ? (
        checking ? (
          <p className="text-[13.5px] text-muted">
            Checking this browser for your file...
          </p>
        ) : (
          <UploadStep
            file={file}
            reading={reading}
            error={error}
            onFile={choose}
            onRemove={remove}
            onContinue={() => go('map')}
          />
        )
      ) : step === 'map' && file && mapState ? (
        <MapStep
          file={file}
          accounts={accounts}
          accountId={accountId}
          onAccount={setAccountId}
          onAccountCreated={accountCreated}
          focusPoint={focusPoint}
          onFocused={focused}
          state={mapState}
          onState={setMapState}
          save={save}
          onSave={setSave}
          onBack={() => go('upload')}
          onContinue={() => go('preview')}
        />
      ) : step === 'map' ? null : step === 'preview' &&
        file &&
        mapState &&
        account ? (
        <PreviewStep
          file={file}
          mapping={mapState.mapping}
          account={account}
          onBack={() => go('map')}
          onSetPoints={() => {
            setFocusPoint(true);
            go('map');
          }}
          onChooseAnother={() => go('upload')}
          onDone={(job) => {
            setDone(job);
            go('confirm');
          }}
        />
      ) : step === 'confirm' && done && account ? (
        <ImportDone job={done} account={account} onAnother={remove} />
      ) : null}
    </div>
  );
}

function Stepper({
  step,
  file,
  ready,
  onGo,
}: {
  step: Step;
  file: ImportFile | null;
  ready: boolean;
  onGo: (step: Step) => void;
}) {
  const current = STEPS.indexOf(step);
  const Glyph = file?.kind === 'xlsx' ? FileXls : FileCsv;
  return (
    <div
      className={`${CARD} flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3`}
    >
      {/* A phone gets the one line and a bar, not the list. */}
      <div className="min-w-0 flex-1 sm:hidden">
        <p className="text-[13.5px] font-semibold text-text">
          Step {current + 1} of {STEPS.length}: {STEP_NAME[step]}
        </p>
        <div
          role="progressbar"
          aria-label="Import progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={current + 1}
          aria-valuetext={`Step ${current + 1} of ${STEPS.length}`}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${((current + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>
      <ol
        aria-label="Import steps"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-y-2 max-sm:hidden"
      >
        {STEPS.map((s, i) => {
          const done = i < current;
          const here = i === current;
          // A step already passed can be gone back to; the ones ahead are reached by Continue.
          const canGo = done && (s === 'upload' || ready);
          const body = (
            <>
              <span
                aria-hidden="true"
                className={`grid size-[26px] shrink-0 place-items-center rounded-full text-[12.5px] font-semibold ${
                  here
                    ? 'bg-accent text-accent-fg shadow-[0_2px_6px_-1px_rgb(43_53_175/0.45)]'
                    : done
                      ? 'bg-accent-soft text-accent'
                      : 'text-faint shadow-[inset_0_0_0_1.5px_var(--line-2)]'
                }`}
              >
                {done ? <Check size={14} weight="bold" /> : i + 1}
              </span>
              <span
                className={`text-[13.5px] ${here ? 'font-semibold text-text' : done ? 'font-medium text-muted' : 'font-medium text-faint'}`}
              >
                {STEP_NAME[s]}
              </span>
            </>
          );
          return (
            <li
              key={s}
              aria-current={here ? 'step' : undefined}
              className="flex items-center"
            >
              {i > 0 ? (
                <span
                  aria-hidden="true"
                  className="mx-3 hidden h-px w-8 bg-line-2 sm:mx-3.5 sm:block sm:w-12"
                />
              ) : null}
              {canGo ? (
                <button
                  type="button"
                  onClick={() => onGo(s)}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-control pr-1 pointer-coarse:min-h-11"
                >
                  {body}
                  <span className="sr-only">, go back to this step</span>
                </button>
              ) : (
                <span className="flex min-h-9 items-center gap-2.5 max-sm:mr-4">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {file ? (
        <div className="flex min-w-0 items-center gap-2.5 border-line sm:border-l sm:pl-5">
          <IconTile icon={Glyph} tone="neutral" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] leading-tight font-semibold text-text">
              {file.name}
            </p>
            <p className="text-[12px] text-faint">{fileSummary(file)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
