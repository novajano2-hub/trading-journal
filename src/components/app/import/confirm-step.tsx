'use client';

import {
  ArrowCounterClockwise,
  CheckCircle,
  UploadSimple,
} from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CARD, CARD_PAD, CardHeader } from '@/components/app/dashboard/shared';
import { Button } from '@/components/ui/button';
import { buttonClasses } from '@/components/ui/button-styles';
import { IconTile } from '@/components/ui/icon-tile';
import {
  useActiveWorkspace,
  useCommitImport,
  useSetActiveWorkspace,
} from '@/data/query/hooks';
import { StalePlanError } from '@/data/repository';
import { USER_WORKSPACE } from '@/data/workspaces';
import type { ImportPlan } from '@/domain/import/plan';
import type { Account, ImportJob } from '@/domain/types';
import { plural } from '@/lib/format';
import { clearPendingImport } from '@/lib/pending-import';

export const IMPORT_HISTORY = '/app/settings/import-history';

const ICON = { 'aria-hidden': true } as const;

const count = (n: number, one: string) =>
  `${n.toLocaleString('en-US')} ${plural(n, one)}`;

/** The count and its noun: "1 trade", "58 trades". */
export const trades = (n: number) =>
  `${n.toLocaleString('en-US')} ${plural(n, 'trade')}`;

/** The undo line, which names where to find it. */
export function UndoLine({ className = '' }: { className?: string }) {
  return (
    <p
      className={`flex items-start gap-2 text-[12.5px] leading-normal text-muted ${className}`}
    >
      <ArrowCounterClockwise
        {...ICON}
        size={16}
        className="mt-px shrink-0 text-faint"
      />
      <span>
        You can undo this import from{' '}
        <Link
          href={IMPORT_HISTORY}
          className="rounded-chip font-medium text-accent-ink underline underline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent"
        >
          Import history
        </Link>
        .
      </span>
    </p>
  );
}

/** Step 4, before the write: what will be added, and the button that adds it. */
export function ConfirmStep({
  plan,
  account,
  onBack,
  onStale,
  onDone,
}: {
  plan: ImportPlan;
  account: Account;
  onBack: () => void;
  /** The plan no longer fits the account: the preview is read again. */
  onStale: () => void;
  onDone: (job: ImportJob) => void;
}) {
  const commit = useCommitImport();
  const [failed, setFailed] = useState(false);
  const n = plan.trades.length;
  const rebuilt = plan.replacedTrades.length;

  async function run() {
    setFailed(false);
    try {
      const job = await commit.mutateAsync(plan);
      // The file has done its job; nothing waits in this browser any more.
      clearPendingImport().catch(() => undefined);
      onDone(job);
    } catch (e) {
      if (e instanceof StalePlanError) onStale();
      else setFailed(true);
    }
  }

  return (
    <section className={`${CARD} ${CARD_PAD}`} aria-labelledby="import-confirm">
      <CardHeader
        icon={UploadSimple}
        tone="accent"
        headingId="import-confirm"
        title="Confirm"
      />
      <p className="mt-2.5 text-[14px] leading-normal text-muted">
        Add <b className="font-semibold text-text">{trades(n)}</b> to{' '}
        <b className="font-semibold text-text">{account.name}</b> in My
        workspace. Duplicates and rows with issues stay out.
        {rebuilt > 0
          ? ` ${trades(rebuilt)} already there ${rebuilt === 1 ? 'is' : 'are'} rebuilt with the new fills, keeping your notes and tags.`
          : ''}
      </p>
      <Button
        onClick={() => void run()}
        disabled={commit.isPending}
        className="mt-3 h-10 w-full !whitespace-normal text-[14.5px]"
      >
        {commit.isPending
          ? 'Importing...'
          : `Import ${trades(n)} into ${account.name}`}
      </Button>
      <button
        type="button"
        onClick={onBack}
        disabled={commit.isPending}
        className={`${buttonClasses('secondary')} mt-2 w-full`}
      >
        Back to columns
      </button>
      {failed ? (
        <p role="alert" className="mt-3 text-[13px] text-loss">
          Keel couldn&apos;t save the import. Nothing was changed. Try again.
        </p>
      ) : null}
      <UndoLine className="mt-3" />
    </section>
  );
}

/** What the import did, and where to go next. */
export function ImportDone({
  job,
  account,
  onAnother,
}: {
  job: ImportJob;
  account: Account;
  onAnother: () => void;
}) {
  const router = useRouter();
  const active = useActiveWorkspace().data;
  const setActive = useSetActiveWorkspace();
  const [busy, setBusy] = useState(false);

  async function view() {
    setBusy(true);
    try {
      // The trades are in My workspace; the sidebar may have been switched since.
      // Switching clears the account, strategy and tag filters, so they come from the address below.
      if (active?.id !== USER_WORKSPACE.id)
        await setActive.mutateAsync(USER_WORKSPACE.id);
      router.push(`/app/trades?account=${encodeURIComponent(account.id)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`${CARD} ${CARD_PAD} max-w-[640px]`}
      aria-labelledby="import-done"
    >
      <div className="flex items-start gap-3">
        <IconTile icon={CheckCircle} tone="gain" />
        <div className="min-w-0">
          <h2
            id="import-done"
            className="text-[17px] leading-snug font-semibold tracking-[-0.015em] text-text"
          >
            {trades(job.tradeCount)} imported into {account.name}.
          </h2>
          <p className="mt-1 text-[13.5px] leading-snug text-muted">
            {job.duplicateCount > 0
              ? `${count(job.duplicateCount, 'row')} already imported ${job.duplicateCount === 1 ? 'was' : 'were'} skipped. `
              : ''}
            {job.skippedCount > 0
              ? `${count(job.skippedCount, 'row')} with issues ${job.skippedCount === 1 ? 'was' : 'were'} left out.`
              : ''}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void view()} disabled={busy}>
          View trades
        </Button>
        <button
          type="button"
          onClick={onAnother}
          className={buttonClasses('secondary')}
        >
          Import another file
        </button>
      </div>
      <UndoLine className="mt-4" />
    </section>
  );
}
