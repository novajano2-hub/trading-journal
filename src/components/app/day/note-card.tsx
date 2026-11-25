'use client';

import {
  CaretDown,
  FileText,
  LockSimple,
} from '@phosphor-icons/react/dist/ssr';
import { useRef, useState } from 'react';
import { buttonClasses } from '@/components/ui/button-styles';
import { Chip } from '@/components/ui/chip';
import { useJournal, usePrefs, useTemplates } from '@/data/query/hooks';
import type { JournalEntry, NoteTemplate } from '@/domain/types';
import type { DayMode } from '@/lib/day-routes';
import { CARD, CARD_PAD, Caption, CardHeader } from '../dashboard/shared';
import { ConfirmDialog } from '../confirm-dialog';
import { findDailyEntry } from '../notebook/notebook-model';
import { clock } from '../trades/trade-time';
import { TemplatesDialog } from '../notebook/templates-dialog';
import type { NoteEditorHandle } from '../notes/note-editor';
import { DayNoteBinding, type NoteStatus } from '../trades/trade-journal';
import { FirstVisitTip } from './first-visit-tip';
import { TemplateMenu } from './template-menu';

/** Every piece of text in a Tiptap document, in order. */
function textOf(node: unknown): string {
  if (node === null || typeof node !== 'object') return '';
  const n = node as { text?: unknown; content?: unknown };
  const own = typeof n.text === 'string' ? n.text : '';
  return Array.isArray(n.content)
    ? own + n.content.map(textOf).join('\n')
    : own;
}

const LINK =
  'inline-flex items-center rounded-chip font-semibold text-accent-ink outline-offset-2 hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11';

/**
 * The day's note: Templates inserts at the cursor, Change template replaces
 * the body (after asking, when you have written in it) and records the
 * template. It saves as you type, and is read-only for a finished day. The
 * plan and the review pages both show it; the template line, Change template
 * and the one-time tip belong to plan mode (TradeZella's review note has
 * none), and Templates stays in both.
 */
export function NoteCard({
  date,
  mode,
  readOnly,
}: {
  date: string;
  mode: DayMode;
  readOnly: boolean;
}): React.JSX.Element {
  const handle = useRef<NoteEditorHandle | null>(null);
  const stamp = useRef<Partial<JournalEntry> | undefined>(undefined);
  const [status, setStatus] = useState<NoteStatus>('idle');
  const [chosen, setChosen] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<NoteTemplate | null>(null);
  const [manage, setManage] = useState<null | 'all' | 'default'>(null);
  const journal = useJournal();
  const templates = useTemplates().data;
  const timeZone = usePrefs().data?.timeZone;

  const entry = findDailyEntry(journal.data, date);
  const locked = readOnly || entry?.deletedAt !== undefined;
  const daily = (templates ?? []).filter((t) => t.kind === 'daily-review');
  // The template the note started from. A date with no note yet shows the
  // default it will start from. A stored note with no `templateId` (made
  // before it was recorded; Keel's call, the origin is unknown) or whose
  // template is gone names none.
  const source = daily.find(
    (t) =>
      t.id ===
      (chosen ??
        entry?.templateId ??
        (entry ? undefined : daily.find((d) => d.isDefault)?.id)),
  );
  const plan = mode === 'plan';

  const apply = (t: NoteTemplate) => {
    stamp.current = { templateId: t.id };
    setChosen(t.id);
    handle.current?.insertContent(structuredClone(t.body), true);
  };
  const change = (t: NoteTemplate) => {
    const written =
      textOf(handle.current?.getJSON()).trim() !== textOf(source?.body).trim();
    if (written) setReplacing(t);
    else apply(t);
  };

  const caption =
    status === 'saving'
      ? 'Saving'
      : status === 'failed'
        ? null
        : entry
          ? timeZone === undefined
            ? null
            : `Saved ${clock(entry.updatedAt, timeZone, false)}`
          : null;

  const templatesButton = (
    <button type="button" className={buttonClasses('ghost', 'sm')}>
      <FileText size={15} aria-hidden="true" />
      Templates
      <CaretDown
        size={12}
        weight="bold"
        aria-hidden="true"
        className="text-faint"
      />
    </button>
  );

  return (
    <section
      aria-labelledby="day-note-title"
      className={`${CARD} ${CARD_PAD} min-w-0 lg:self-stretch`}
    >
      <CardHeader
        headingId="day-note-title"
        title="Day note"
        after={
          locked && readOnly ? (
            <Chip>
              <LockSimple size={12} aria-hidden="true" />
              Locked
            </Chip>
          ) : status === 'failed' ? (
            <span role="alert" className="text-[12.5px] text-loss">
              Couldn&apos;t save
            </span>
          ) : caption ? (
            <Caption>{caption}</Caption>
          ) : undefined
        }
        end={
          locked ? undefined : (
            <TemplateMenu
              trigger={templatesButton}
              onPick={(t) =>
                handle.current?.insertContent(structuredClone(t.body))
              }
              manage={{
                onManage: () => setManage('all'),
                onEditDefault: () => setManage('default'),
              }}
            />
          )
        }
      />
      {plan && (source || !locked) ? (
        <p className="mt-0.5 text-[12.5px] text-faint">
          {source ? (
            <>
              From the <b className="font-semibold text-muted">{source.name}</b>{' '}
              template.{' '}
            </>
          ) : null}
          {locked ? null : (
            <TemplateMenu
              trigger={
                <button type="button" className={LINK}>
                  Change template
                </button>
              }
              onPick={change}
            />
          )}
        </p>
      ) : null}
      {plan && !locked ? <FirstVisitTip /> : null}
      <div className="mt-3 max-w-[72ch] min-w-0">
        <DayNoteBinding
          date={date}
          readOnly={readOnly}
          handleRef={handle}
          stamp={stamp}
          onStatus={setStatus}
        />
      </div>
      <TemplatesDialog
        open={manage !== null}
        onOpenChange={(o) => !o && setManage(null)}
        editDefault={manage === 'default'}
      />
      <ConfirmDialog
        open={replacing !== null}
        title="Replace the note?"
        body={`Your text is replaced by the ${replacing?.name ?? ''} template.`}
        confirmLabel="Replace note"
        onConfirm={async () => {
          if (replacing) apply(replacing);
        }}
        onClose={() => setReplacing(null)}
      />
    </section>
  );
}
