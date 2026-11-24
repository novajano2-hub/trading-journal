'use client';

import { useId, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Plus, X } from '@phosphor-icons/react/dist/ssr';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import {
  useRemoveTemplate,
  useSaveTemplate,
  useSetDefaultTemplate,
  useTemplates,
} from '@/data/query/hooks';
import type { JournalKind, NoteTemplate } from '@/domain/types';
import { ConfirmDialog } from '../confirm-dialog';
import { NoteEditor } from '../notes/note-editor';
import { KIND_LABEL } from './notebook-model';

/** The kinds a note can start from, in the order the dialog lists them. */
const KINDS: readonly JournalKind[] = [
  'daily-review',
  'pre-market',
  'weekly-recap',
  'note',
];

const SMALL =
  'inline-flex h-8 items-center gap-1 rounded-[8px] px-2.5 text-[13px] font-medium text-muted outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

interface Editing {
  /** Absent for a template not saved yet. */
  id?: string;
  kind: JournalKind;
  name: string;
  body: unknown;
  isDefault: boolean;
}

/** One template's name and body, to change and save. */
function TemplateForm({
  editing,
  onClose,
}: {
  editing: Editing;
  onClose(): void;
}): React.JSX.Element {
  const save = useSaveTemplate();
  const nameId = useId();
  const [name, setName] = useState(editing.name);
  const body = useRef(editing.body);
  const [seed] = useState(editing.body);
  const [failed, setFailed] = useState(false);
  const ready = name.trim() !== '';

  const submit = async () => {
    setFailed(false);
    try {
      await save.mutateAsync({
        ...(editing.id ? { id: editing.id } : {}),
        kind: editing.kind,
        name: name.trim(),
        body: body.current,
        isDefault: editing.isDefault,
      });
      onClose();
    } catch {
      setFailed(true);
    }
  };

  return (
    <div>
      <p className="text-[13px] text-faint">{KIND_LABEL[editing.kind]}</p>
      <label htmlFor={nameId} className="mt-3 block text-[13px] text-muted">
        Name
      </label>
      <input
        id={nameId}
        aria-label="Template name"
        value={name}
        maxLength={80}
        placeholder="Template name"
        onChange={(e) => setName(e.target.value)}
        className="mt-1 h-10 w-full rounded-control border border-line bg-surface-1 px-3 text-[14.5px] text-text outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
      />
      <p className="mt-4 mb-1 text-[13px] text-muted">Body</p>
      <div className="max-h-[42dvh] min-h-[160px] overflow-y-auto rounded-control border border-line px-3 py-2">
        <NoteEditor
          label="Template body"
          value={seed}
          onChange={(doc) => {
            body.current = doc;
          }}
        />
      </div>
      {failed ? (
        <p role="alert" className="mt-3 text-[13px] text-loss">
          Couldn&apos;t save the template. Try again.
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!ready || save.isPending}
          onClick={() => void submit()}
        >
          Save template
        </Button>
      </div>
    </div>
  );
}

/**
 * The templates, by kind: each can be edited and set as its kind's default,
 * and the ones you made can be deleted (a built-in stays as the fallback).
 */
export function TemplatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}): React.JSX.Element {
  const templates = useTemplates().data;
  const setDefault = useSetDefaultTemplate();
  const remove = useRemoveTemplate();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<NoteTemplate | null>(null);
  const [failed, setFailed] = useState(false);

  const close = (next: boolean) => {
    if (!next) setEditing(null);
    onOpenChange(next);
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={close}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-veil" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(720px,calc(100dvh-32px))] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[16px] border border-line bg-surface-1 p-6 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=open]:animate-pop-in max-sm:p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-[17px] leading-snug font-semibold tracking-[-0.015em]">
                  {editing
                    ? editing.id
                      ? 'Edit template'
                      : 'New template'
                    : 'Templates'}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-[14px] leading-[1.55] text-muted">
                  A new note starts from its kind&apos;s default template.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close"
                className="grid size-8 flex-none place-items-center rounded-[8px] text-faint outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
              >
                <X size={16} aria-hidden="true" />
              </Dialog.Close>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
              {editing ? (
                <TemplateForm
                  editing={editing}
                  onClose={() => setEditing(null)}
                />
              ) : (
                <>
                  {failed ? (
                    <p role="alert" className="mb-3 text-[13px] text-loss">
                      Couldn&apos;t change that template. Try again.
                    </p>
                  ) : null}
                  {KINDS.map((kind) => {
                    const own = (templates ?? []).filter(
                      (t) => t.kind === kind,
                    );
                    const fallback = own.find((t) => t.isDefault)?.body;
                    return (
                      <section
                        key={kind}
                        role="group"
                        aria-label={KIND_LABEL[kind]}
                        className="mb-5 last:mb-0"
                      >
                        <div className="flex items-center gap-2">
                          <h3 className="text-[14.5px] font-semibold">
                            {KIND_LABEL[kind]}
                          </h3>
                          <button
                            type="button"
                            aria-label={`New ${KIND_LABEL[kind]} template`}
                            onClick={() =>
                              setEditing({
                                kind,
                                name: '',
                                body: structuredClone(
                                  fallback ?? {
                                    type: 'doc',
                                    content: [{ type: 'paragraph' }],
                                  },
                                ),
                                isDefault: false,
                              })
                            }
                            className={`${SMALL} ml-auto`}
                          >
                            <Plus size={13} weight="bold" aria-hidden="true" />
                            New
                          </button>
                        </div>
                        {own.length === 0 ? (
                          <p className="mt-1 text-[13.5px] text-muted">
                            No template yet. A new{' '}
                            {KIND_LABEL[kind].toLowerCase()} starts empty.
                          </p>
                        ) : (
                          <ul className="mt-1 divide-y divide-line">
                            {own.map((t) => (
                              <li
                                key={t.id}
                                aria-label={t.name}
                                className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2"
                              >
                                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                                  {t.name}
                                </span>
                                {t.isDefault ? (
                                  <Chip tone="accent">Default</Chip>
                                ) : null}
                                <button
                                  type="button"
                                  aria-label={`Edit ${t.name}`}
                                  onClick={() =>
                                    setEditing({
                                      id: t.id,
                                      kind: t.kind,
                                      name: t.name,
                                      body: structuredClone(t.body),
                                      isDefault: t.isDefault,
                                    })
                                  }
                                  className={SMALL}
                                >
                                  Edit
                                </button>
                                {t.isDefault ? null : (
                                  <button
                                    type="button"
                                    aria-label={`Set ${t.name} as default`}
                                    onClick={() => {
                                      setFailed(false);
                                      setDefault.mutate(t.id, {
                                        onError: () => setFailed(true),
                                      });
                                    }}
                                    className={SMALL}
                                  >
                                    Set as default
                                  </button>
                                )}
                                {t.builtIn ? null : (
                                  <button
                                    type="button"
                                    aria-label={`Delete ${t.name}`}
                                    onClick={() => setDeleting(t)}
                                    className={`${SMALL} hover:text-loss`}
                                  >
                                    Delete
                                  </button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    );
                  })}
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the template ${deleting?.name ?? ''}?`}
        body={
          deleting?.isDefault
            ? 'It is the default for its kind. New notes start from the built-in template again.'
            : 'Notes already made from it keep their text.'
        }
        confirmLabel="Delete template"
        danger
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}
