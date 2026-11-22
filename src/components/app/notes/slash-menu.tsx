'use client';

// The "/" menu of the note editor: a listbox of the blocks you can insert,
// driven by Tiptap's suggestion plugin. The plugin owns the trigger and the
// keys; this file owns the items and how they look.
import { useEffect, useRef } from 'react';
import { Extension, type Editor, type Range } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';

type Chain = ReturnType<Editor['chain']>;

export interface SlashItem {
  label: string;
  hint: string;
  run: (chain: Chain) => Chain;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    label: 'Heading 1',
    hint: 'A large section title',
    run: (c) => c.toggleHeading({ level: 1 }),
  },
  {
    label: 'Heading 2',
    hint: 'A medium section title',
    run: (c) => c.toggleHeading({ level: 2 }),
  },
  {
    label: 'Heading 3',
    hint: 'A small prompt or label',
    run: (c) => c.toggleHeading({ level: 3 }),
  },
  {
    label: 'Bulleted list',
    hint: 'Points in no set order',
    run: (c) => c.toggleBulletList(),
  },
  {
    label: 'Numbered list',
    hint: 'Steps in order',
    run: (c) => c.toggleOrderedList(),
  },
  {
    label: 'Checklist',
    hint: 'Things to tick off',
    run: (c) => c.toggleTaskList(),
  },
  { label: 'Quote', hint: 'Set a line apart', run: (c) => c.toggleBlockquote() },
  {
    label: 'Collapsible section',
    hint: 'A titled block you can fold away',
    run: (c) => c.setDetails(),
  },
  {
    label: 'Table',
    hint: 'Rows and columns, 3 by 3',
    run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  },
  {
    label: 'Divider',
    hint: 'A line between sections',
    run: (c) => c.setHorizontalRule(),
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter((i) => i.label.toLowerCase().includes(q));
}

export interface SlashState {
  items: SlashItem[];
  index: number;
  rect: DOMRect | null;
  pick: (item: SlashItem) => void;
}

export interface SlashBridge {
  set: (state: SlashState | null) => void;
  /** The current state, read by the key handler. */
  get: () => SlashState | null;
}

const key = new PluginKey('noteSlashMenu');

export function createSlashExtension(bridge: SlashBridge) {
  return Extension.create({
    name: 'noteSlash',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: key,
          char: '/',
          startOfLine: false,
          allow: ({ state, range }) => {
            // Not inside code, and only at the start of a word.
            const $from = state.doc.resolve(range.from);
            return !$from.parent.type.spec.code;
          },
          items: ({ query }) => filterSlashItems(query),
          command: ({ editor, range, props }) => {
            props.run(editor.chain().focus().deleteRange(range as Range));
          },
          render: () => {
            let index = 0;
            const push = (p: {
              items: SlashItem[];
              clientRect?: (() => DOMRect | null) | null;
              command: (item: SlashItem) => void;
            }) => {
              index = Math.min(index, Math.max(0, p.items.length - 1));
              bridge.set({
                items: p.items,
                index,
                rect: p.clientRect?.() ?? null,
                pick: p.command,
              });
            };
            return {
              onStart: (p) => {
                index = 0;
                push(p);
              },
              onUpdate: (p) => {
                index = 0;
                push(p);
              },
              onKeyDown: ({ event }) => {
                const s = bridge.get();
                if (!s) return false;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  const n = s.items.length;
                  if (n === 0) return true;
                  index =
                    (index + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
                  bridge.set({ ...s, index });
                  return true;
                }
                if (event.key === 'Enter') {
                  const item = s.items[index];
                  if (item) s.pick(item);
                  return true;
                }
                if (event.key === 'Escape') {
                  bridge.set(null);
                  return false; // lets the plugin close itself
                }
                return false;
              },
              onExit: () => bridge.set(null),
            };
          },
        }),
      ];
    },
  });
}

export const SLASH_LISTBOX_ID = 'note-slash-listbox';
export const slashOptionId = (i: number) => `note-slash-option-${i}`;

export function SlashMenu({ state }: { state: SlashState }) {
  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [state.index]);

  const rect = state.rect;
  const style: React.CSSProperties = rect
    ? {
        position: 'fixed',
        left: Math.max(
          8,
          Math.min(rect.left, (globalThis.innerWidth ?? 400) - 268),
        ),
        top: rect.bottom + 6,
      }
    : { position: 'fixed', left: 8, top: 120 };

  return (
    <div
      style={style}
      className="z-50 w-[260px] max-w-[calc(100vw-16px)] rounded-[12px] border border-line bg-surface-1 p-1 shadow-[var(--shadow)]"
    >
      {state.items.length === 0 ? (
        <p className="px-3 py-2 text-[13px] text-faint">Nothing matches.</p>
      ) : (
        <ul
          role="listbox"
          id={SLASH_LISTBOX_ID}
          aria-label="Insert a block"
          className="max-h-[300px] overflow-y-auto"
        >
          {state.items.map((item, i) => (
            <li
              key={item.label}
              ref={i === state.index ? activeRef : undefined}
              id={slashOptionId(i)}
              role="option"
              aria-selected={i === state.index}
              // Keep the editor's selection: mousedown must not blur it.
              onMouseDown={(e) => {
                e.preventDefault();
                state.pick(item);
              }}
              className={`flex cursor-pointer flex-col rounded-[8px] px-3 py-1.5 pointer-coarse:min-h-11 pointer-coarse:justify-center ${
                i === state.index ? 'bg-sunken' : ''
              }`}
            >
              <span className="text-[13.5px] font-medium text-text">
                {item.label}
              </span>
              <span className="text-[12px] text-faint">{item.hint}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
