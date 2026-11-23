'use client';

import { useEffect, useRef, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  DotsThree,
  FileText,
  Folder,
  FolderSimplePlus,
  Trash,
} from '@phosphor-icons/react/dist/ssr';
import {
  useCreateFolder,
  useRemoveFolder,
  useRenameFolder,
} from '@/data/query/hooks';
import { DuplicateNameError } from '@/data/repository';
import type { NoteFolder } from '@/domain/types';
import { ConfirmDialog } from '../confirm-dialog';
import {
  BUILT_IN_FOLDERS,
  userFolderKey,
  type FolderKey,
} from './notebook-model';

const MENU =
  'z-[60] min-w-[160px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const MENU_ITEM =
  'flex min-h-9 cursor-pointer items-center rounded-[8px] px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken pointer-coarse:min-h-11';
const ROW =
  'flex h-[34px] min-w-0 flex-1 items-center gap-2.5 whitespace-nowrap rounded-[9px] px-2.5 text-left text-[14px] font-medium outline-offset-0 focus-visible:outline-2 focus-visible:outline-accent max-lg:flex-none max-lg:px-3 pointer-coarse:h-11';
const NAME_INPUT =
  'h-[34px] w-full min-w-0 rounded-[9px] border border-line-2 bg-surface-1 px-2.5 text-[14px] text-text outline-none focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

/** A name typed into a row: Enter keeps it, Escape leaves it. A refusal shows under the row. */
function NameField({
  label,
  initial = '',
  onSubmit,
  onCancel,
}: {
  label: string;
  initial?: string;
  onSubmit(name: string): Promise<void>;
  onCancel(): void;
}): React.JSX.Element {
  const [name, setName] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  const submit = async () => {
    const wanted = name.trim();
    if (wanted === '') return onCancel();
    try {
      await onSubmit(wanted);
    } catch (e) {
      setProblem(
        e instanceof DuplicateNameError
          ? `A folder called ${e.duplicate} already exists.`
          : "Couldn't save that name. Try again.",
      );
    }
  };
  return (
    <div className="min-w-0 flex-1 px-1 py-1">
      <input
        ref={input}
        aria-label={label}
        value={name}
        maxLength={60}
        onChange={(e) => {
          setName(e.target.value);
          setProblem(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (problem === null) onCancel();
        }}
        className={NAME_INPUT}
      />
      {problem ? (
        <p role="alert" className="mt-1 px-1 text-[12.5px] text-loss">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

function Count({ n }: { n: number }): React.JSX.Element {
  return (
    <span className="ml-auto text-[12px] font-medium text-faint tabular-nums">
      {n}
    </span>
  );
}

/**
 * Favourites, the kinds' folders and My notes, then the user's own folders and
 * Trash. Below `lg` it is one row that scrolls sideways.
 */
export function FolderRail({
  folders,
  counts,
  current,
  onSelect,
  onOpenTemplates,
  newMenu,
}: {
  folders: readonly NoteFolder[];
  /** The entries in each folder, by key. */
  counts: ReadonlyMap<FolderKey, number>;
  current: FolderKey;
  onSelect(key: FolderKey): void;
  onOpenTemplates(): void;
  newMenu: React.ReactNode;
}): React.JSX.Element {
  const create = useCreateFolder();
  const rename = useRenameFolder();
  const remove = useRemoveFolder();
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<NoteFolder | null>(null);

  const item = (key: FolderKey, label: string, glyph: React.ReactNode) => {
    const on = current === key;
    return (
      <button
        type="button"
        aria-current={on ? 'true' : undefined}
        onClick={() => onSelect(key)}
        className={`${ROW} ${on ? 'bg-accent-soft font-semibold text-text [&_svg]:text-accent' : 'text-muted hover:bg-sunken hover:text-text'}`}
      >
        {glyph}
        <span className="min-w-0 truncate">{label}</span>
        <Count n={counts.get(key) ?? 0} />
      </button>
    );
  };

  return (
    <nav
      aria-label="Folders"
      className="flex min-w-0 gap-1 overflow-x-auto rounded-card border border-line bg-surface-1 p-2.5 shadow-[var(--shadow-card)] max-lg:items-center lg:flex-col lg:overflow-y-auto lg:px-2.5 lg:py-3.5"
    >
      <div className="flex-none max-lg:mr-1 lg:mx-1 lg:mb-3.5">{newMenu}</div>
      <ul className="flex min-w-0 gap-1 max-lg:flex-none max-lg:items-center lg:flex-col">
        {BUILT_IN_FOLDERS.map(({ key, label, icon: Glyph }) => (
          <li key={key} className="flex max-lg:shrink-0">
            {item(key, label, <Glyph size={17} aria-hidden="true" />)}
          </li>
        ))}
      </ul>
      <h3 className="mx-2.5 mt-3.5 mb-1.5 text-[12.5px] font-medium text-faint max-lg:hidden">
        Your folders
      </h3>
      <ul
        aria-label="Your folders"
        className="flex min-w-0 gap-1 max-lg:flex-none max-lg:items-center lg:flex-col"
      >
        {folders.map((f) => (
          <li key={f.id} className="flex items-center max-lg:shrink-0">
            {renaming === f.id ? (
              <NameField
                label="Folder name"
                initial={f.name}
                onCancel={() => setRenaming(null)}
                onSubmit={async (name) => {
                  await rename.mutateAsync({ id: f.id, name });
                  setRenaming(null);
                }}
              />
            ) : (
              <>
                {item(
                  userFolderKey(f.id),
                  f.name,
                  <Folder size={17} aria-hidden="true" />,
                )}
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    aria-label={`Folder options: ${f.name}`}
                    className="grid size-8 flex-none place-items-center rounded-[8px] text-faint outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
                  >
                    <DotsThree size={18} weight="bold" aria-hidden="true" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={4}
                      className={MENU}
                    >
                      <DropdownMenu.Item
                        className={MENU_ITEM}
                        onSelect={() => setRenaming(f.id)}
                      >
                        Rename
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className={`${MENU_ITEM} text-loss`}
                        onSelect={() => setDeleting(f)}
                      >
                        Delete folder
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </>
            )}
          </li>
        ))}
        <li className="flex max-lg:shrink-0">
          {naming ? (
            <NameField
              label="Folder name"
              onCancel={() => setNaming(false)}
              onSubmit={async (name) => {
                const made = await create.mutateAsync(name);
                setNaming(false);
                onSelect(userFolderKey(made.id));
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              className={`${ROW} text-faint hover:bg-sunken hover:text-text`}
            >
              <FolderSimplePlus size={17} aria-hidden="true" />
              New folder
            </button>
          )}
        </li>
      </ul>
      <div className="flex min-w-0 gap-1 max-lg:flex-none max-lg:items-center lg:mt-auto lg:flex-col lg:pt-3">
        <button
          type="button"
          onClick={onOpenTemplates}
          className={`${ROW} flex-none text-muted hover:bg-sunken hover:text-text`}
        >
          <FileText size={17} aria-hidden="true" />
          Templates
        </button>
        <div className="flex max-lg:shrink-0">
          {item('trash', 'Trash', <Trash size={17} aria-hidden="true" />)}
        </div>
      </div>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the folder ${deleting?.name ?? ''}?`}
        body="Its notes move to My notes. No note is deleted."
        confirmLabel="Delete folder"
        danger
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          if (current === userFolderKey(deleting.id)) onSelect('my-notes');
        }}
        onClose={() => setDeleting(null)}
      />
    </nav>
  );
}
