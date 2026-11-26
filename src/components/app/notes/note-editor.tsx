'use client';

// The rich-text note editor, shared by the trade note, the notebook and the
// templates. A note is stored as Tiptap JSON. The parent debounces its saves
// (600 ms); this component reports every change.
import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Content } from '@tiptap/react';
import { EditorToolbar } from './editor-toolbar';
import { noteExtensions } from './extensions';
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
  /** Puts a Tiptap document's content at the cursor, or in place of everything with `replace`. */
  insertContent: (doc: unknown, replace?: boolean) => void;
  /** The document as it stands. */
  getJSON: () => unknown;
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

  const extensions = useMemo(
    () => [...noteExtensions(placeholder), createSlashExtension(bridge)],
    [placeholder, bridge],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    autofocus: autoFocus && !readOnly ? 'end' : false,
    content: asDoc(value),
    extensions,
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
  // not the echo of our own edits. A saved note may lack the attributes the
  // schema fills in (alignment, indent, a toggle's open state), so both sides
  // are read through the schema before they are compared.
  useEffect(() => {
    if (!editor) return;
    const next = asDoc(value);
    let same: boolean;
    try {
      same =
        JSON.stringify(editor.getJSON()) ===
        JSON.stringify(editor.schema.nodeFromJSON(next).toJSON());
    } catch {
      same = JSON.stringify(editor.getJSON()) === JSON.stringify(next);
    }
    if (!same) editor.commands.setContent(next, { emitUpdate: false });
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
      insertContent: (doc, replace = false) => {
        const content = (doc as { content?: unknown } | null)?.content ?? doc;
        const chain = replace
          ? editor.chain().focus().clearContent()
          : editor.chain().focus();
        chain.insertContent(content as Content).run();
      },
      getJSON: () => editor.getJSON(),
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
      {editor && !readOnly ? <EditorToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
      {slash ? <SlashMenu state={slash} /> : null}
    </div>
  );
}
