'use client';

// The rich-text note editor, shared by the trade note, the notebook and the
// templates. A note is stored as Tiptap JSON. The parent debounces its saves
// (600 ms); this component reports every change.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor, type Content } from '@tiptap/react';
import { ClockCounterClockwise, X } from '@phosphor-icons/react/dist/ssr';
import 'katex/dist/katex.min.css';
import { usePrefs } from '@/data/query/hooks';
import { useHasData } from '@/data/query/provider';
import { DEFAULT_NOTE_TYPE, noteTypeOf } from '@/domain/note-type';
import type { JournalEntry, NoteType } from '@/domain/types';
import { usePhone } from '@/lib/use-phone';
import { FileViewer, type ViewerFile } from '../trades/file-viewer';
import { BlockHandle } from './block-handle';
import { speechSupported, startDictation } from './dictation';
import { EditorToolbar, type TemplateSlot } from './editor-toolbar';
import {
  EMOJI_LISTBOX_ID,
  EmojiMenu,
  emojiOptionId,
  type EmojiBridge,
  type EmojiState,
} from './emoji-menu';
import { EmbedPolicyContext, type EmbedPolicy } from './embed-view';
import { noteExtensions } from './extensions';
import { createImageLink, fileIdOf } from './extensions/image-model';
import { ImageIntake } from './image-intake';
import { NoteBlocks, createBlockLink } from './note-blocks';
import { noteTypeStyle } from './note-type-style';
import { VersionHistory } from './version-history';
import { VersionKeeper } from './version-keeper';
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
  /**
   * `links`: a YouTube video or a post from X is only its link, and nothing is
   * asked of an outside server (a print or export layout). Default `live`: an
   * embed plays or shows while the note is open and the browser is online.
   */
  embeds?: EmbedPolicy;
  /**
   * The host's own template menu, drawn in the toolbar beside Insert: it is
   * given the toolbar's button to use as the menu's trigger. Without it the
   * toolbar has no Template control.
   */
  templateSlot?: TemplateSlot;
  /**
   * Whether the toolbar offers full screen (default). A host that sits inside
   * a box that is moved with a transform (a centred dialog) says no: a fixed
   * layer inside it would fill that box and not the window.
   */
  canFullScreen?: boolean;
  /**
   * A version was restored: the note as the store has it now. The editor has
   * taken its body already; a host that keeps its own copy of the note (to save
   * the title or the star on top of) takes this one in place of it.
   */
  onRestored?: (entry: JournalEntry) => void;
}

/** Marks everything on the page but the ancestors of `el` as out of reach (`inert`); returns the way to undo exactly that. */
function inertAround(el: HTMLElement): () => void {
  const changed: Element[] = [];
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== node && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert', '');
        changed.push(sibling);
      }
    }
  }
  return () => {
    for (const sibling of changed) sibling.removeAttribute('inert');
  };
}

/** Why dictation stopped, for a person; the browser's own reasons are not words. */
function dictationProblem(reason: string): string | null {
  switch (reason) {
    case 'not-allowed':
    case 'service-not-allowed':
      return "Keel can't use the microphone. Allow it in your browser's site settings to dictate.";
    case 'network':
      return "The browser's speech service can't be reached right now.";
    case 'start-failed':
      return "Dictation couldn't start. Try again.";
    case 'no-speech':
    case 'aborted':
      return null;
    default:
      return 'Dictation stopped.';
  }
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

/** A body drawn read-only, as a print layout or a version's preview shows it: no toolbar, embeds as links. */
export function NotePreview({
  body,
  label,
}: {
  body: unknown;
  label: string;
}): React.JSX.Element {
  return (
    <NoteEditor
      value={body}
      onChange={() => {}}
      label={label}
      readOnly
      embeds="links"
    />
  );
}

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
const asDoc = (v: unknown) =>
  v && typeof v === 'object' && (v as { type?: unknown }).type === 'doc'
    ? (v as Record<string, unknown>)
    : EMPTY_DOC;

/**
 * The editor, drawn at the sizes the note settings give (Settings > Notebook,
 * B41): the Notebook, a trade's notes, the day page, a version preview and the
 * print layout all come through here, so one setting reaches them all. With no
 * app data behind it (a test, a bare embed) it reads the defaults.
 */
export function NoteEditor(props: NoteEditorProps): React.JSX.Element {
  return useHasData() ? (
    <SavedNoteType {...props} />
  ) : (
    <NoteEditorBox {...props} noteType={DEFAULT_NOTE_TYPE} />
  );
}

function SavedNoteType(props: NoteEditorProps): React.JSX.Element {
  const saved = usePrefs().data?.noteType;
  return <NoteEditorBox {...props} noteType={noteTypeOf(saved)} />;
}

function NoteEditorBox({
  noteType,
  value,
  onChange,
  label,
  placeholder = 'Write here, or type / for blocks',
  readOnly = false,
  autoFocus = false,
  handleRef,
  noteId,
  ensureNoteId,
  embeds = 'live',
  templateSlot,
  canFullScreen = true,
  onRestored,
}: NoteEditorProps & { noteType: NoteType }): React.JSX.Element {
  const hasData = useHasData();
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef<SlashState | null>(null);
  const [bridge] = useState<SlashBridge>(() => ({
    set: (s) => {
      slashRef.current = s;
      setSlash(s);
    },
    get: () => slashRef.current,
  }));
  const [emoji, setEmoji] = useState<EmojiState | null>(null);
  const emojiRef = useRef<EmojiState | null>(null);
  const [emojiBridge] = useState<EmojiBridge>(() => ({
    set: (s) => {
      emojiRef.current = s;
      setEmoji(s);
    },
    get: () => emojiRef.current,
  }));
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  // The version keeper hears each edit from here, so the body is read once.
  const edits = useRef(new Set<(body: unknown) => void>());
  const subscribe = useCallback((onEdit: (body: unknown) => void) => {
    edits.current.add(onEdit);
    return () => {
      edits.current.delete(onEdit);
    };
  }, []);

  // What paste, drop and the picker call to store an image, and what an image
  // calls to open larger; the pieces that do the work fill it in.
  const [images] = useState(createImageLink);
  // What the blocks that need the app ask of it: the time, a dialog, an offer.
  const [blocks] = useState(createBlockLink);
  const extensions = useMemo(
    () => [
      ...noteExtensions(
        placeholder,
        images.bridge,
        blocks.bridge,
        () => emojiBridge,
      ),
      createSlashExtension(bridge),
    ],
    [placeholder, bridge, images, blocks, emojiBridge],
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
    onUpdate: ({ editor: e }) => {
      const body = e.getJSON();
      onChangeRef.current(body);
      for (const onEdit of edits.current) onEdit(body);
    },
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

  // The open menu's listbox is the editor's active descendant.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const open =
      slash && slash.items.length > 0
        ? { list: SLASH_LISTBOX_ID, option: slashOptionId(slash.index) }
        : emoji && emoji.items.length > 0
          ? { list: EMOJI_LISTBOX_ID, option: emojiOptionId(emoji.index) }
          : null;
    if (open) {
      dom.setAttribute('aria-controls', open.list);
      dom.setAttribute('aria-activedescendant', open.option);
      dom.setAttribute('aria-expanded', 'true');
    } else {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
      dom.removeAttribute('aria-expanded');
    }
  }, [editor, slash, emoji]);

  // The handles need a pointer that hovers: not on a phone.
  const phone = usePhone();
  // Images are stored files: without the app's data there is nowhere to put one.
  const takesImages =
    hasData &&
    !readOnly &&
    (noteId !== undefined || ensureNoteId !== undefined);
  const handles = !readOnly && !phone;

  // ---- version history (B39) ------------------------------------------------
  // A note that is stored, or that the host stores on its first change, keeps
  // versions; the dialog is built the first time it opens, so a note nobody
  // opens the history of reads no versions.
  const keepsVersions =
    hasData && (noteId !== undefined || ensureNoteId !== undefined);
  const [historyBuilt, setHistoryBuilt] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [now, setNow] = useState<unknown>(null);
  const historyFrom = useRef<HTMLElement | null>(null);
  const [restored, setRestored] = useState('');
  const openHistory = (from: HTMLElement | null) => {
    if (!editor) return;
    historyFrom.current =
      from ?? (document.activeElement as HTMLElement | null);
    setNow(editor.getJSON());
    setHistoryBuilt(true);
    setHistoryOpen(true);
  };
  useEffect(() => {
    if (restored === '') return;
    const id = setTimeout(() => setRestored(''), 8000);
    return () => clearTimeout(id);
  }, [restored]);

  // ---- full screen (B37) ----------------------------------------------------
  // The same editor, not another: the box is fixed over the window, the page
  // behind is out of reach, Escape or the control leaves.
  const [full, setFull] = useState(false);
  const isFull = full && !readOnly;
  const root = useRef<HTMLDivElement>(null);
  const fullFrom = useRef<HTMLElement | null>(null);
  const toggleFull = () => {
    if (!full) fullFrom.current = document.activeElement as HTMLElement | null;
    setFull(!full);
  };
  useEffect(() => {
    if (!isFull || !editor || !root.current) return;
    const release = inertAround(root.current);
    editor.commands.focus();
    // Escape leaves, unless something on top of the note is open (a menu, a
    // dialog that does not hold the note, the slash or emoji list, an offer to
    // embed a link) or the focus is in a field that uses Escape itself (a
    // caption, a time, the link address). Asked before anything handles the
    // key: ProseMirror takes every Escape pressed in the text, so "taken
    // already" cannot say which; and a dialog that holds the note (the day
    // note's) listens on the document, so this listens on the window, ahead of
    // it, and keeps the key from it when it leaves.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const top = root.current;
      if (!top) return;
      const target = event.target as Element | null;
      if (slashRef.current?.items.length || emojiRef.current?.items.length)
        return;
      if (top.querySelector('[role="group"][aria-label="Embed this link"]'))
        return;
      if (
        target &&
        top.contains(target) &&
        target.closest('input, textarea, select')
      )
        return;
      for (const layer of document.querySelectorAll(
        '[role="menu"], [role="dialog"], [role="alertdialog"]',
      ))
        if (layer !== top && !layer.contains(top)) return;
      event.preventDefault();
      event.stopPropagation();
      setFull(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      release();
      const back = fullFrom.current;
      if (back?.isConnected && back !== document.body) back.focus();
      else editor.commands.focus();
    };
  }, [isFull, editor]);

  // ---- dictation (B38, U4) --------------------------------------------------
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const stopDictation = useRef<(() => void) | null>(null);
  const toggleDictation = () => {
    if (!editor) return;
    setDictationError(null);
    if (stopDictation.current) {
      stopDictation.current();
      return;
    }
    setDictating(true);
    stopDictation.current = startDictation(
      (text) => {
        const { from } = editor.state.selection;
        const before =
          from > 1 ? editor.state.doc.textBetween(from - 1, from) : '';
        const lead = before !== '' && !/\s/.test(before) ? ' ' : '';
        editor.chain().focus().insertContent(`${lead}${text}`).run();
      },
      {
        onEnd: () => {
          stopDictation.current = null;
          setDictating(false);
        },
        onError: (reason) => {
          setDictationError(dictationProblem(reason));
          stopDictation.current = null;
          setDictating(false);
        },
      },
    );
  };
  // Leaving the note, or locking it, stops the listening.
  useEffect(
    () => () => {
      stopDictation.current?.();
    },
    [],
  );
  useEffect(() => {
    if (readOnly) stopDictation.current?.();
  }, [readOnly]);

  return (
    <div
      ref={root}
      style={noteTypeStyle(noteType)}
      {...(isFull
        ? {
            role: 'dialog',
            'aria-modal': true,
            'aria-label': `${label}, full screen`,
          }
        : {})}
      className={
        isFull
          ? 'fixed inset-0 z-[45] flex flex-col overflow-y-auto overscroll-contain bg-surface-1 px-4 pb-24 sm:px-[max(2rem,calc((100%-900px)/2))]' +
            (handles ? ' note-with-handles' : '')
          : `flex flex-col${handles ? ' note-with-handles' : ''}`
      }
    >
      {editor && !readOnly ? (
        <EditorToolbar
          editor={editor}
          images={takesImages}
          blocks
          sticky={isFull}
          templateSlot={templateSlot}
          onHistory={keepsVersions ? openHistory : undefined}
          onFullScreen={canFullScreen ? toggleFull : undefined}
          fullScreen={isFull}
          onDictate={speechSupported() ? toggleDictation : undefined}
          dictating={dictating}
        />
      ) : null}
      {editor && readOnly && hasData && noteId !== undefined ? (
        <button
          type="button"
          onClick={(e) => openHistory(e.currentTarget)}
          className="mb-1 inline-flex h-8 items-center gap-1.5 self-end rounded-[8px] px-2.5 text-[13px] font-medium text-muted outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
        >
          <ClockCounterClockwise size={15} aria-hidden="true" />
          Version history
        </button>
      ) : null}
      {dictationError ? (
        <p role="alert" className="mt-2 text-[13px] text-loss">
          {dictationError}
        </p>
      ) : null}
      <div role="status" aria-label="Dictation" className="sr-only">
        {dictating ? 'Listening' : ''}
      </div>
      <div
        role="status"
        aria-label="Version history"
        className={restored ? 'mt-2' : 'sr-only'}
      >
        {restored ? (
          <div className="flex items-center gap-2 rounded-control bg-sunken py-1.5 pr-1.5 pl-3 text-[13px] text-text">
            <span className="min-w-0 flex-1">{restored}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setRestored('')}
              className="grid size-7 place-items-center rounded-[7px] text-faint hover:bg-surface-1 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
      {editor && !readOnly ? (
        <NoteBlocks editor={editor} link={blocks} />
      ) : null}
      {editor && takesImages ? (
        <ImageIntake
          editor={editor}
          link={images}
          noteId={noteId}
          ensureNoteId={ensureNoteId}
        />
      ) : null}
      {editor && !readOnly && keepsVersions ? (
        <VersionKeeper noteId={noteId} subscribe={subscribe} />
      ) : null}
      <EmbedPolicyContext.Provider value={embeds}>
        <EditorContent editor={editor} />
      </EmbedPolicyContext.Provider>
      {editor && handles ? <BlockHandle editor={editor} /> : null}
      {slash ? <SlashMenu state={slash} /> : null}
      {emoji ? <EmojiMenu state={emoji} /> : null}
      {viewing ? (
        <FileViewer
          files={viewing.files}
          index={viewing.index}
          origin={origin}
          onIndex={(index) => setViewing((v) => v && { ...v, index })}
          onClose={() => setViewing((v) => v && { ...v, index: null })}
        />
      ) : null}
      {editor && historyBuilt ? (
        <VersionHistory
          noteId={noteId}
          readOnly={readOnly}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          origin={historyFrom}
          returnFocus={historyFrom}
          current={now}
          preview={(body) => (
            <NotePreview body={body} label="Version preview" />
          )}
          onRestored={(entry, _version, when) => {
            editor.commands.setContent(asDoc(entry.body), {
              emitUpdate: false,
            });
            onRestored?.(entry);
            setRestored(`Restored the version from ${when}.`);
          }}
        />
      ) : null}
    </div>
  );
}
