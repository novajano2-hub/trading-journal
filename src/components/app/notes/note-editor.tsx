'use client';

// The rich-text note editor, shared by the trade note, the notebook and the
// templates. A note is stored as Tiptap JSON. The parent debounces its saves
// (600 ms); this component reports every change.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor, type Content } from '@tiptap/react';
import { FileViewer, type ViewerFile } from '../trades/file-viewer';
import { EditorToolbar } from './editor-toolbar';
import { noteExtensions } from './extensions';
import { createImageLink, fileIdOf } from './extensions/image-model';
import { ImageIntake } from './image-intake';
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
  /**
   * The stored note this editor edits. Its images are files owned by
   * `note:<id>`. Without it (and without `ensureNoteId`) the editor shows
   * images but takes none: no Image in Insert, a paste or drop does nothing.
   */
  noteId?: string;
  /** For a note that is not stored yet: stores it, and says its id, when its first image comes. */
  ensureNoteId?: () => Promise<string>;
}

/** The images in the body that are stored files, in reading order. */
function imagesOf(editor: Editor): (ViewerFile & { pos: number })[] {
  const out: (ViewerFile & { pos: number })[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image' && node.type.name !== 'inlineImage') return;
    const id = fileIdOf(node.attrs.src);
    if (id !== undefined)
      out.push({ id, pos, name: String(node.attrs.alt ?? '') || 'Image' });
  });
  return out;
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
  noteId,
  ensureNoteId,
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

  // What paste, drop and the picker call to store an image, and what an image
  // calls to open larger; the pieces that do the work fill it in.
  const [images] = useState(createImageLink);
  const extensions = useMemo(
    () => [
      ...noteExtensions(placeholder, images.bridge),
      createSlashExtension(bridge),
    ],
    [placeholder, bridge, images],
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

  // Images open larger in the viewer, among this note's images only. The
  // viewer is kept once opened so it can play its exit.
  const [viewing, setViewing] = useState<{
    files: ViewerFile[];
    index: number | null;
  } | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!editor) return;
    return images.provide({
      open: (pos, from) => {
        const all = imagesOf(editor);
        const index = all.findIndex((i) => i.pos === pos);
        if (index < 0) return;
        origin.current =
          from.querySelector<HTMLElement>('button.note-image-open') ?? from;
        setViewing({
          files: all.map(({ id, name }) => ({ id, name })),
          index,
        });
      },
    });
  }, [editor, images]);

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

  const takesImages =
    !readOnly && (noteId !== undefined || ensureNoteId !== undefined);
  return (
    <div className="flex flex-col">
      {editor && !readOnly ? (
        <EditorToolbar editor={editor} images={takesImages} />
      ) : null}
      {editor && takesImages ? (
        <ImageIntake
          editor={editor}
          link={images}
          noteId={noteId}
          ensureNoteId={ensureNoteId}
        />
      ) : null}
      <EditorContent editor={editor} />
      {slash ? <SlashMenu state={slash} /> : null}
      {viewing ? (
        <FileViewer
          files={viewing.files}
          index={viewing.index}
          origin={origin}
          onIndex={(index) => setViewing((v) => v && { ...v, index })}
          onClose={() => setViewing((v) => v && { ...v, index: null })}
        />
      ) : null}
    </div>
  );
}
