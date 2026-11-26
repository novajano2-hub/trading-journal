'use client';

import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/app/confirm-dialog';
import { CARD, CardHeader } from '@/components/app/dashboard/shared';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import {
  useImportHistory,
  usePrefs,
  useUndoImport,
  useUserAccounts,
} from '@/data/query/hooks';
import { ArchivedAccountError } from '@/data/repository';
import type { ImportJob } from '@/domain/types';
import { plural } from '@/lib/format';

/** Why an archived account's import has no Undo (ruling M15: its trades are read-only). */
const ARCHIVED_UNDO =
  "Imports into an archived account can't be undone: its trades are read-only. Unarchive the account in Accounts to undo one.";

const TH =
  'h-10 px-3 text-left text-[12px] font-medium whitespace-nowrap text-faint first:pl-5 last:pr-5';
const TD = 'h-12 px-3 align-middle first:pl-5 last:pr-5';
const NUM = 'text-right tabular-nums';

/** "21 Nov 2026, 12:00" in the trader's zone. */
function when(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

/** Every import, newest first, with Undo for the active ones. */
export function ImportHistory() {
  const history = useImportHistory();
  const accounts = useUserAccounts().data;
  const timeZone = usePrefs().data?.timeZone ?? 'UTC';
  const undo = useUndoImport();
  const [asking, setAsking] = useState<ImportJob | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const jobs = history.data ?? [];
  const accountName = (id: string) =>
    accounts?.find((a) => a.id === id)?.name ?? 'Removed account';
  const archived = (id: string) =>
    accounts?.find((a) => a.id === id)?.status === 'archived';
  const anyArchived = jobs.some(
    (j) => j.status === 'active' && archived(j.accountId),
  );

  async function run(job: ImportJob) {
    let result;
    try {
      result = await undo.mutateAsync(job.id);
    } catch (e) {
      // The repository refuses it too, should the account be archived since the list loaded.
      if (e instanceof ArchivedAccountError) {
        setBlocked(ARCHIVED_UNDO);
        return;
      }
      throw e;
    }
    if (result.ok) {
      setBlocked(null);
      return;
    }
    if (result.reason === 'regrouped') {
      setBlocked(
        `${job.fileName} can't be undone. Some of its trades were merged, split or moved since it came in, and Keel can't take that back. Delete those trades, or move them back to ${accountName(job.accountId)}, then undo the import.`,
      );
      return;
    }
    const later = jobs.find((j) => j.id === result.dependentJobId);
    setBlocked(
      `${job.fileName} can't be undone yet. A later import${later ? `, ${later.fileName},` : ''} built on its trades. Undo that one first.`,
    );
  }

  return (
    <div className="grid w-full grid-cols-[minmax(0,1fr)] gap-4">
      {blocked ? (
        <p
          role="alert"
          className="rounded-control bg-warn-soft px-3.5 py-3 text-[13px] leading-snug text-text"
        >
          {blocked}
        </p>
      ) : null}

      <section className={`${CARD} overflow-hidden pt-[18px] pb-3`}>
        <CardHeader
          className="px-5"
          headingId="import-history-list"
          title="Import history"
          end={
            <Link
              href="/app/import"
              className={buttonClasses('secondary', 'sm')}
            >
              <ArrowLeft aria-hidden="true" size={14} />
              Back to Import
            </Link>
          }
        />
        {history.status === 'error' ? (
          <p role="alert" className="px-5 pt-3 text-[13.5px] text-loss">
            Keel couldn&apos;t read the import history. Reload the page to try
            again.
          </p>
        ) : !history.data ? (
          <p role="status" className="px-5 pt-3 text-[13.5px] text-muted">
            Loading your imports...
          </p>
        ) : jobs.length === 0 ? (
          <div className="px-5 pt-3 text-[13.5px] text-muted">
            <p>No imports yet.</p>
            <p className="mt-1">
              <Link
                href="/app/import"
                className="font-medium text-accent-ink underline underline-offset-2"
              >
                Import a file
              </Link>{' '}
              and it is listed here, with a way to undo it.
            </p>
          </div>
        ) : (
          <div className="relative mt-3 overflow-x-auto">
            <table
              aria-labelledby="import-history-list"
              className="w-full min-w-[820px] border-collapse text-[13px]"
            >
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className={TH}>
                    File
                  </th>
                  <th scope="col" className={TH}>
                    Account
                  </th>
                  <th scope="col" className={TH}>
                    Date
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Rows
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Trades
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Duplicates
                  </th>
                  <th scope="col" className={`${TH} ${NUM}`}>
                    Skipped
                  </th>
                  <th scope="col" className={TH}>
                    Status
                  </th>
                  <th scope="col" className={TH}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.id}
                    className="border-b border-line/70 last:border-b-0"
                  >
                    <td
                      className={`${TD} max-w-[240px] truncate font-semibold text-text`}
                      title={job.fileName}
                    >
                      {job.fileName}
                    </td>
                    <td className={`${TD} text-muted`}>
                      {accountName(job.accountId)}
                    </td>
                    <td
                      className={`${TD} whitespace-nowrap text-muted tabular-nums`}
                    >
                      {when(job.createdAt, timeZone)}
                    </td>
                    <td className={`${TD} ${NUM}`}>{job.rowCount}</td>
                    <td className={`${TD} ${NUM}`}>{job.tradeCount}</td>
                    <td className={`${TD} ${NUM}`}>{job.duplicateCount}</td>
                    <td className={`${TD} ${NUM}`}>{job.skippedCount}</td>
                    <td className={TD}>
                      <Chip tone={job.status === 'active' ? 'gain' : 'neutral'}>
                        {job.status === 'active' ? 'Active' : 'Undone'}
                      </Chip>
                    </td>
                    <td className={`${TD} text-right`}>
                      {job.status === 'active' ? (
                        <button
                          type="button"
                          aria-label={`Undo ${job.fileName}`}
                          disabled={archived(job.accountId)}
                          aria-describedby={
                            archived(job.accountId)
                              ? 'import-history-archived'
                              : undefined
                          }
                          onClick={() => {
                            setBlocked(null);
                            setAsking(job);
                          }}
                          className="inline-flex h-8 cursor-pointer items-center rounded-chip px-2.5 text-[12.5px] font-semibold text-accent-ink hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent pointer-coarse:h-11"
                        >
                          Undo
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {anyArchived ? (
              <p
                id="import-history-archived"
                className="px-5 pt-3 text-[13px] leading-snug text-muted"
              >
                {ARCHIVED_UNDO}
              </p>
            ) : null}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={asking !== null}
        title="Undo this import?"
        body={
          asking
            ? `Undo this import? Its ${asking.tradeCount.toLocaleString('en-US')} ${plural(asking.tradeCount, 'trade')} ${asking.tradeCount === 1 ? 'is' : 'are'} removed. Rows a later import skipped as duplicates stay out until you import that file again.`
            : ''
        }
        confirmLabel="Undo import"
        danger
        onConfirm={() => (asking ? run(asking) : Promise.resolve())}
        onClose={() => setAsking(null)}
      />
    </div>
  );
}
