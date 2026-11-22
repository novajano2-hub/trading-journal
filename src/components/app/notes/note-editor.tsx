'use client';

// The rich-text note editor, shared by the trade note, the notebook and the
// templates. A note is stored as Tiptap JSON. The parent debounces its saves
// (600 ms); this component reports every change.
import { useEffect, useRef, useState } from 'react';
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  LinkSimple,
  ListBullets,
  ListChecks,
  ListNumbers,
  Quotes,
  TextB,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextItalic,
} from '@phosphor-icons/react/dist/ssr';
import {
  SLASH_ITEMS,
  SLASH_LISTBOX_ID,
  SlashMenu,
  createSlashExtension,
  slashOptionId,
  type SlashBridge,
  type SlashState,
} from './slash-menu';
import './note-prose.css';

export interface NoteEditorHandle {
  /** Runs a slash-menu item by its label, at the current selection. */
  runSlashCommand: (label: string) => void;
}

export interface NoteEditorProps {
  value: unknown;
  onChange(doc: unknown): void;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  /** Test and embedding hook: receives the editor's command handle. */
  handleRef?: { current: NoteEditorHandle | null };
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
const asDoc = (v: unknown) =>
  v && typeof v === 'object' && (v as { type?: unknown }).type === 'doc'
    ? (v as Record<string, unknown>)
    : EMPTY_DOC;

export function NoteEditor({
  value,
  onChange,
  label,
  placeholder = 'Write here, or type / for blocks',
  readOnly = false,
  autoFocus = false,
  handleRef,
}: NoteEditorProps): React.JSX.Element {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef<SlashState | null>(null);
  const [bridge] = useState<SlashBridge>(() => ({
    set: (s) => {
      slashRef.current = s;
      setSlash(s);
    },
    get: () => slashRef.current,
  }));
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    autofocus: autoFocus && !readOnly ? 'end' : false,
    content: asDoc(value),
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Details.configure({
        persist: true,
        renderToggleButton: ({ element, isOpen }) => {
          element.setAttribute(
            'aria-label',
            isOpen ? 'Collapse section' : 'Expand section',
          );
          element.setAttribute('aria-expanded', String(isOpen));
        },
      }),
      DetailsSummary,
      DetailsContent,
      Placeholder.configure({ placeholder }),
      createSlashExtension(bridge),
    ],
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class: 'note-prose',
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON()),
  });

  // Follow an outside change (another note opened, a template applied), but
  // not the echo of our own edits.
  useEffect(() => {
    if (!editor) return;
    const next = asDoc(value);
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(next)) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    // No update event: switching modes is not an edit.
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!handleRef) return;
    if (!editor) {
      handleRef.current = null;
      return;
    }
    handleRef.current = {
      runSlashCommand: (name) => {
        const item = SLASH_ITEMS.find((i) => i.label === name);
        if (item) item.run(editor.chain().focus()).run();
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [editor, handleRef]);

  // The listbox is the editor's active descendant while the menu is open.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    if (slash && slash.items.length > 0) {
      dom.setAttribute('aria-controls', SLASH_LISTBOX_ID);
      dom.setAttribute('aria-activedescendant', slashOptionId(slash.index));
      dom.setAttribute('aria-expanded', 'true');
    } else {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
      dom.removeAttribute('aria-expanded');
    }
  }, [editor, slash]);

  return (
    <div className="flex flex-col">
      {editor && !readOnly ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
      {slash ? <SlashMenu state={slash} /> : null}
    </div>
  );
}

type ToolButton = {
  name: string;
  icon: React.ReactNode;
  active?: (e: Editor) => boolean;
  run: (e: Editor) => void;
};

const ICON = { size: 16, 'aria-hidden': true } as const;

const GROUPS: ToolButton[][] = [
  [
    {
      name: 'Bold',
      icon: <TextB {...ICON} />,
      active: (e) => e.isActive('bold'),
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      name: 'Italic',
      icon: <TextItalic {...ICON} />,
      active: (e) => e.isActive('italic'),
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
  ],
  [
    {
      name: 'Heading 1',
      icon: <TextHOne {...ICON} />,
      active: (e) => e.isActive('heading', { level: 1 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      name: 'Heading 2',
      icon: <TextHTwo {...ICON} />,
      active: (e) => e.isActive('heading', { level: 2 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      name: 'Heading 3',
      icon: <TextHThree {...ICON} />,
      active: (e) => e.isActive('heading', { level: 3 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
  ],
  [
    {
      name: 'Bulleted list',
      icon: <ListBullets {...ICON} />,
      active: (e) => e.isActive('bulletList'),
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      name: 'Numbered list',
      icon: <ListNumbers {...ICON} />,
      active: (e) => e.isActive('orderedList'),
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      name: 'Checklist',
      icon: <ListChecks {...ICON} />,
      active: (e) => e.isActive('taskList'),
      run: (e) => e.chain().focus().toggleTaskList().run(),
    },
    {
      name: 'Quote',
      icon: <Quotes {...ICON} />,
      active: (e) => e.isActive('blockquote'),
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
  ],
];

const BTN =
  'grid h-7 w-[30px] place-items-center rounded-[7px] text-muted hover:bg-surface-1 hover:text-text hover:shadow-[var(--shadow-chip)] aria-pressed:bg-surface-1 aria-pressed:text-text aria-pressed:shadow-[var(--shadow-chip)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:shadow-none pointer-coarse:h-11 pointer-coarse:w-11';

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      active: [...GROUPS.flat(), { name: 'Link', active: (x: Editor) => x.isActive('link') }]
        .filter((b) => b.active?.(e))
        .map((b) => b.name),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
    equalityFn: (a, b) =>
      !!b &&
      a.active.join() === b.active.join() &&
      a.canUndo === b.canUndo &&
      a.canRedo === b.canRedo,
  });

  const openLink = () => {
    setHref((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkOpen((o) => !o);
  };
  const applyLink = (e: React.FormEvent) => {
    e.preventDefault();
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url) chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}` }).run();
    else chain.unsetLink().run();
    setLinkOpen(false);
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex max-w-full flex-wrap items-center gap-0.5 self-start rounded-[10px] bg-sunken p-1"
      >
        {GROUPS.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 ? (
              <span aria-hidden="true" className="mx-1 h-[18px] w-px bg-line-2" />
            ) : null}
            {group.map((b) => (
              <button
                key={b.name}
                type="button"
                aria-label={b.name}
                title={b.name}
                aria-pressed={state.active.includes(b.name)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => b.run(editor)}
                className={BTN}
              >
                {b.icon}
              </button>
            ))}
            {gi === 0 ? (
              <button
                type="button"
                aria-label="Link"
                title="Link"
                aria-pressed={state.active.includes('Link')}
                aria-expanded={linkOpen}
                onMouseDown={(e) => e.preventDefault()}
                onClick={openLink}
                className={BTN}
              >
                <LinkSimple {...ICON} />
              </button>
            ) : null}
          </div>
        ))}
        <span aria-hidden="true" className="mx-1 h-[18px] w-px bg-line-2" />
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          disabled={!state.canUndo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
          className={BTN}
        >
          <ArrowUUpLeft {...ICON} />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          disabled={!state.canRedo}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
          className={BTN}
        >
          <ArrowUUpRight {...ICON} />
        </button>
      </div>
      {linkOpen ? (
        <form
          onSubmit={applyLink}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setLinkOpen(false);
              editor.commands.focus();
            }
          }}
          className="flex w-full max-w-[420px] items-center gap-2"
        >
          <input
            autoFocus
            type="text"
            inputMode="url"
            aria-label="Link address"
            placeholder="Paste or type an address"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-[9px] border border-line-2 bg-surface-1 px-3 text-[13.5px] text-text placeholder:text-faint"
          />
          <button
            type="submit"
            className="h-9 rounded-[9px] bg-accent px-3 text-[13px] font-medium text-accent-fg hover:bg-accent-hover"
          >
            {href.trim() ? 'Apply' : 'Remove link'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
