'use client';

// The "/" menu of the note editor: a listbox of the blocks you can insert,
// driven by Tiptap's suggestion plugin. The plugin owns the trigger and the
// keys; this file owns the items and how they look.
import { useEffect, useRef } from 'react';
import { Extension, type Editor, type Range } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import {
  suggestionRender,
  type MenuBridge,
  type MenuState,
} from './extensions/suggestion-render';
import { leaveToggle } from './extensions/toggle';
import { placeMenu } from './menu-position';

type Chain = ReturnType<Editor['chain']>;

export interface SlashItem {
  label: string;
  hint: string;
  /** Other words that find it: what a person from another editor types. */
  keywords?: string[];
  /** Left out of the menu where this is false (a note that cannot take images has no Image). */
  available?: (editor: Editor) => boolean;
  run: (chain: Chain) => Chain;
}

const align = (value: 'left' | 'center' | 'right' | 'justify') => (c: Chain) =>
  c.setTextAlign(value);

/**
 * Every block the "/" menu offers, in the comp's order (comp 05): text, lists,
 * quote and code, the folding blocks, table and divider, the layouts, the
 * links, alignment, then the embeds.
 */
export const SLASH_ITEMS: SlashItem[] = [
  {
    label: 'Normal text',
    hint: 'Plain paragraph text',
    keywords: ['paragraph', 'plain', 'text'],
    run: (c) => leaveToggle(c).clearNodes(),
  },
  {
    label: 'Heading 1',
    hint: 'A large section title',
    keywords: ['h1', 'title'],
    run: (c) => c.toggleHeading({ level: 1 }),
  },
  {
    label: 'Heading 2',
    hint: 'A medium section title',
    keywords: ['h2'],
    run: (c) => c.toggleHeading({ level: 2 }),
  },
  {
    label: 'Heading 3',
    hint: 'A small prompt or label',
    keywords: ['h3'],
    run: (c) => c.toggleHeading({ level: 3 }),
  },
  {
    label: 'Bulleted list',
    hint: 'Points in no set order',
    keywords: ['bullet', 'unordered'],
    run: (c) => c.toggleBulletList(),
  },
  {
    label: 'Numbered list',
    hint: 'Steps in order',
    keywords: ['ordered'],
    run: (c) => c.toggleOrderedList(),
  },
  {
    label: 'Checklist',
    hint: 'Things to tick off',
    keywords: ['todo', 'task', 'check'],
    run: (c) => c.toggleTaskList(),
  },
  {
    label: 'Timed list',
    hint: 'Each line starts with the time',
    keywords: ['time', 'log', 'timeline', 'clock'],
    run: (c) => c.toggleTimedList(),
  },
  {
    label: 'Quote',
    hint: 'Set a line apart',
    keywords: ['blockquote'],
    run: (c) => c.toggleBlockquote(),
  },
  {
    label: 'Code block',
    hint: 'Text as typed, in a fixed width',
    keywords: ['code', 'monospace', 'snippet'],
    run: (c) => c.toggleCodeBlock(),
  },
  {
    label: 'Collapsible section',
    hint: 'A titled block you can fold away',
    keywords: ['fold', 'details', 'accordion'],
    run: (c) => c.setDetails(),
  },
  {
    label: 'Toggle',
    hint: 'Folds the blocks under it',
    keywords: ['fold'],
    run: (c) => c.insertToggle(0),
  },
  {
    label: 'Toggle heading 1',
    hint: 'A large title that folds',
    keywords: ['fold'],
    run: (c) => c.insertToggle(1),
  },
  {
    label: 'Toggle heading 2',
    hint: 'A medium title that folds',
    keywords: ['fold'],
    run: (c) => c.insertToggle(2),
  },
  {
    label: 'Toggle heading 3',
    hint: 'A small title that folds',
    keywords: ['fold'],
    run: (c) => c.insertToggle(3),
  },
  {
    label: 'Table',
    hint: 'Rows and columns, 3 by 3',
    keywords: ['grid'],
    run: (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  },
  {
    label: 'Divider',
    hint: 'A line between sections',
    keywords: ['rule', 'line', 'hr', 'horizontal'],
    run: (c) => c.setHorizontalRule(),
  },
  {
    label: 'Two columns',
    hint: 'Two blocks side by side',
    keywords: ['layout', 'side'],
    run: (c) => c.insertColumns(2),
  },
  {
    label: 'Three columns',
    hint: 'Three blocks side by side',
    keywords: ['layout', 'side'],
    run: (c) => c.insertColumns(3),
  },
  {
    label: 'Page break',
    hint: 'Where the PDF starts a new page',
    keywords: ['pdf', 'print'],
    run: (c) => c.setPageBreak(),
  },
  {
    label: 'Equation',
    hint: 'A formula, written in LaTeX',
    keywords: ['math', 'formula', 'latex', 'katex'],
    available: (e) => e.storage.keelBlocks?.canAsk('equation') ?? false,
    run: (c) => c.askEquation(false),
  },
  {
    label: 'Image',
    hint: 'Upload or paste a picture',
    keywords: ['picture', 'photo', 'screenshot'],
    available: (e) => e.storage.image?.canPick() ?? false,
    run: (c) => c.pickImage(false),
  },
  {
    label: 'Trade',
    hint: 'Link a trade, found by search',
    keywords: ['link', 'chip'],
    available: (e) => e.storage.keelBlocks?.canAsk('trade') ?? false,
    run: (c) => c.askTrade(),
  },
  {
    label: 'Day',
    hint: 'Link a day, picked by date',
    keywords: ['link', 'chip', 'date', 'calendar'],
    available: (e) => e.storage.keelBlocks?.canAsk('day') ?? false,
    run: (c) => c.askDay(),
  },
  {
    label: 'Align left',
    hint: 'Line up on the left',
    run: align('left'),
  },
  {
    label: 'Align centre',
    hint: 'Centre the block',
    keywords: ['center', 'middle'],
    run: align('center'),
  },
  {
    label: 'Align right',
    hint: 'Line up on the right',
    run: align('right'),
  },
  {
    label: 'Align justify',
    hint: 'Even edges on both sides',
    keywords: ['justified'],
    run: align('justify'),
  },
  {
    label: 'YouTube video',
    hint: 'Plays while the note is open and online',
    keywords: ['video', 'embed', 'youtube'],
    available: (e) => e.storage.keelBlocks?.canAsk('embed') ?? false,
    run: (c) => c.askEmbed('youtube'),
  },
  {
    label: 'Post from X',
    hint: 'Shows while the note is open and online',
    keywords: ['tweet', 'twitter', 'x', 'embed', 'post'],
    available: (e) => e.storage.keelBlocks?.canAsk('embed') ?? false,
    run: (c) => c.askEmbed('tweet'),
  },
];

/** The items a query finds (by name, then by the words that stand for it), and that this editor can do. */
export function filterSlashItems(query: string, editor?: Editor): SlashItem[] {
  const q = query.trim().toLowerCase();
  const usable = (i: SlashItem) => !editor || (i.available?.(editor) ?? true);
  if (!q) return SLASH_ITEMS.filter(usable);
  return SLASH_ITEMS.filter(
    (i) =>
      usable(i) &&
      (i.label.toLowerCase().includes(q) ||
        (i.keywords ?? []).some((k) => k.startsWith(q))),
  );
}

export type SlashState = MenuState<SlashItem>;
export type SlashBridge = MenuBridge<SlashItem>;

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
          // A name with a space in it ("Toggle heading 2") can be typed whole;
          // the menu closes when a space has taken the query past every name.
          allowSpaces: true,
          shouldShow: ({ query, editor }) =>
            !query.includes(' ') ||
            (!query.startsWith(' ') &&
              filterSlashItems(query, editor).length > 0),
          allow: ({ state, range }) => {
            // Not inside code, and only at the start of a word.
            const $from = state.doc.resolve(range.from);
            return !$from.parent.type.spec.code;
          },
          items: ({ query, editor }) => filterSlashItems(query, editor),
          command: ({ editor, range, props }) => {
            // The "/" and what was typed after it go; the item takes their place.
            props
              .run(
                editor
                  .chain()
                  .focus()
                  .deleteRange(range as Range),
              )
              .run();
          },
          render: suggestionRender<SlashItem>(() => bridge),
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

  // The list, and the line under it, fit the room the screen leaves.
  const { style, room } = placeMenu(state.rect, 280, 336 + 34);

  return (
    <div
      style={style}
      className="z-50 w-[280px] max-w-[calc(100vw-16px)] rounded-[12px] border border-line bg-surface-1 p-1 shadow-[var(--shadow)]"
    >
      {state.items.length === 0 ? (
        <p className="px-3 py-2 text-[13px] text-faint">Nothing matches.</p>
      ) : (
        <ul
          role="listbox"
          id={SLASH_LISTBOX_ID}
          aria-label="Insert a block"
          style={{ maxHeight: room - 34 }}
          className="overflow-y-auto"
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
      <p className="mt-1 border-t border-line px-3 pt-1.5 pb-1 text-[12px] text-faint">
        Keep typing to filter. Type : for emoji.
      </p>
    </div>
  );
}
