'use client';

// How a note's image draws and behaves, block and inline (spec §5.6, B32): the
// picture from its stored file, corner handles that resize it by a width
// percentage, double-click (or a button) to open it larger, and, under a block
// image, a caption. The note stores `keel-file:<id>`; the bytes are read, and
// an object URL made, when the image is near the screen, and revoked when it
// goes. A file that is gone, or a source that is not a stored file, is a
// neutral placeholder.
import { ArrowsOut, ImageBroken } from '@phosphor-icons/react/dist/ssr';
import {
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from '@tiptap/react';
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { EagerFilesContext, useLazyFileUrl } from '../use-file-url';
import {
  fileIdOf,
  MAX_WIDTH,
  MIN_WIDTH,
  percentOf,
  widthOf,
  type ImageBridge,
} from './extensions/image-model';

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;
type Corner = (typeof CORNERS)[number];

/** The block a node view sits in: the first ancestor that lays out as a box (the editor's own wrappers around a node view do not). */
function blockAround(el: Element | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const display = getComputedStyle(p).display;
    if (display !== 'inline' && display !== 'contents') return p;
  }
  return null;
}

/** The width a block's contents may take: its box less its padding and border. */
function contentWidth(el: HTMLElement | null): number {
  if (!el) return 0;
  const box = el.getBoundingClientRect().width;
  const style = getComputedStyle(el);
  const px = (v: string) => Number.parseFloat(v) || 0;
  return (
    box -
    px(style.paddingLeft) -
    px(style.paddingRight) -
    px(style.borderLeftWidth) -
    px(style.borderRightWidth)
  );
}

/**
 * Corner resizing. A drag changes the width the picture is drawn at (`live`);
 * the note changes once, when the pointer is released, so one drag is one undo
 * step. A left corner grows the picture as it moves left. The percentage is of
 * the block the image sits in.
 */
function useResize(box: HTMLElement | null, commit: (width: number) => void) {
  const [live, setLive] = useState<number | null>(null);
  const start = (corner: Corner) => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!box) return;
    // The browser's own drag and the editor's selection must not start.
    e.preventDefault();
    e.stopPropagation();
    const from = e.clientX;
    const began = box.getBoundingClientRect().width;
    const sign = corner.endsWith('l') ? -1 : 1;
    // The block around the figure, or the line the inline image is in.
    const column = contentWidth(
      blockAround(box.closest('[data-node-view-wrapper]')),
    );
    const at = (x: number) => percentOf(began + sign * (x - from), column);
    const move = (ev: PointerEvent) => setLive(at(ev.clientX));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const up = (ev: PointerEvent) => {
      stop();
      setLive(null);
      commit(at(ev.clientX));
    };
    const cancel = () => {
      stop();
      setLive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };
  return { live, start };
}

/** The four corner handles of a selected image: a pointer's way to resize. */
function Handles({
  start,
}: {
  start: (corner: Corner) => (e: React.PointerEvent) => void;
}): React.JSX.Element {
  return (
    <>
      {CORNERS.map((c) => (
        <span
          key={c}
          data-resize-handle={c}
          aria-hidden="true"
          onPointerDown={start(c)}
          className="note-image-handle"
        />
      ))}
    </>
  );
}

/**
 * Everything the block and the inline image share: the frame with the picture
 * (or its placeholder), the handles, and the keyboard's two controls (a width
 * slider and an Open button, both hidden until focused).
 */
function ImageFrame({
  props,
  shown,
  start,
  frame,
  setFrame,
}: {
  props: NodeViewProps;
  /** The width the picture is drawn at, in percent, or null for its own size. */
  shown: number | null;
  start: (corner: Corner) => (e: React.PointerEvent) => void;
  /** The frame's element, once drawn, and the way to hand it up (the resize measures it). */
  frame: HTMLDivElement | null;
  setFrame: (el: HTMLDivElement | null) => void;
}): React.JSX.Element {
  const { node, selected, editor, extension, getPos, updateAttributes } = props;
  const editable = useEditorState({
    editor,
    selector: ({ editor: e }) => e.isEditable,
  });
  const id = fileIdOf(node.attrs.src);
  const alt = String(node.attrs.alt ?? '') || 'Image';
  const { url, status, ref } = useLazyFileUrl<HTMLDivElement>(id);
  // A print layout draws every image now; the browser's own waiting is off too.
  const eager = useContext(EagerFilesContext);
  const bridge = (
    extension.options as { bridge?: () => ImageBridge }
  ).bridge?.();
  const open = () => {
    const pos = getPos();
    if (pos !== undefined && frame) bridge?.open?.(pos, frame);
  };
  // A source that is not a stored file reads as a file that is gone.
  const state = id === undefined ? 'missing' : status;
  const missing = state === 'missing';
  const failed = state === 'error';

  return (
    <div
      ref={(el) => {
        setFrame(el);
        ref(el);
      }}
      data-image-frame=""
      data-state={state}
      onDoubleClick={url ? open : undefined}
      className="note-image-frame"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local object URL, nothing to optimise
        <img
          src={url}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
        />
      ) : missing || failed ? (
        <div className="note-image-missing" role={failed ? 'alert' : undefined}>
          <ImageBroken size={22} aria-hidden="true" />
          {failed ? "Couldn't load this image" : 'Image not found'}
        </div>
      ) : (
        <div className="note-image-loading" aria-busy="true" />
      )}
      {url ? (
        <button
          type="button"
          aria-label={`Open image larger, ${alt}`}
          onClick={open}
          className="note-image-open"
        >
          <ArrowsOut size={14} aria-hidden="true" />
        </button>
      ) : null}
      {editable && url ? (
        <input
          type="range"
          aria-label="Image width"
          min={MIN_WIDTH}
          max={MAX_WIDTH}
          step={5}
          value={shown ?? MAX_WIDTH}
          onChange={(e) =>
            updateAttributes({ width: widthOf(e.currentTarget.value) })
          }
          className="note-image-slider"
        />
      ) : null}
      {editable && url && selected ? <Handles start={start} /> : null}
    </div>
  );
}

/**
 * A text field that is as tall as its text, so a caption wraps instead of
 * running off: it follows what is typed and the width it is given.
 */
function useFitHeight(text: string) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const around = el.parentElement;
    if (!around || typeof ResizeObserver === 'undefined') return;
    let width = around.clientWidth;
    const watch = new ResizeObserver(() => {
      // Only a change of width can change the wrapping.
      if (around.clientWidth === width) return;
      width = around.clientWidth;
      fit();
    });
    watch.observe(around);
    return () => watch.disconnect();
  }, [text]);
  return field;
}

/** The caption: a field under a block image while the note is edited, plain text when it is only read. */
function Caption({
  props,
}: {
  props: NodeViewProps;
}): React.JSX.Element | null {
  const { node, editor, getPos, updateAttributes } = props;
  const editable = useEditorState({
    editor,
    selector: ({ editor: e }) => e.isEditable,
  });
  const caption = String(node.attrs.caption ?? '');
  // The field keeps the caret while the note catches up; an outside change
  // (undo) replaces what it shows.
  const [draft, setDraft] = useState(caption);
  const [seen, setSeen] = useState(caption);
  if (caption !== seen) {
    setSeen(caption);
    setDraft(caption);
  }
  const field = useFitHeight(draft);
  if (!editable) {
    return caption === '' ? null : (
      <figcaption className="note-image-caption">{caption}</figcaption>
    );
  }
  return (
    <textarea
      ref={field}
      rows={1}
      aria-label="Image caption"
      placeholder="Add a caption"
      maxLength={300}
      value={draft}
      onChange={(e) => {
        // One line of words, wrapped to the picture's width.
        const text = e.target.value.replace(/\s*\n\s*/g, ' ');
        setDraft(text);
        updateAttributes({ caption: text });
      }}
      onKeyDown={(e) => {
        const pos = getPos();
        if (pos === undefined) return;
        if (e.key === 'Enter') {
          // On to the text after the image.
          e.preventDefault();
          editor
            .chain()
            .focus()
            .caretAt(pos + node.nodeSize)
            .run();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          editor.chain().focus().setNodeSelection(pos).run();
        }
      }}
      className="note-image-caption-field"
    />
  );
}

/** One image's wrapper: the width (live while a corner is dragged), the frame and, for a block, the caption. */
function useImage(props: NodeViewProps) {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor: e }) => e.isEditable,
  });
  const { live, start } = useResize(frame, (w) =>
    props.updateAttributes({ width: w }),
  );
  const shown = live ?? widthOf(props.node.attrs.width);
  return {
    frame,
    setFrame,
    start,
    shown,
    style: shown !== null ? { width: `${shown}%` } : undefined,
    selected: props.selected && editable ? '' : undefined,
  };
}

/** A block image: a figure with the picture, its handles and a caption. */
export function ImageView(props: NodeViewProps): React.JSX.Element {
  const image = useImage(props);
  return (
    <NodeViewWrapper
      as="figure"
      data-image=""
      data-selected={image.selected}
      className="note-image"
      style={image.style}
    >
      <ImageFrame
        props={props}
        shown={image.shown}
        start={image.start}
        frame={image.frame}
        setFrame={image.setFrame}
      />
      <Caption props={props} />
    </NodeViewWrapper>
  );
}

/** An inline image: the picture in the line of text, resizable like a block image, with no caption. */
export function InlineImageView(props: NodeViewProps): React.JSX.Element {
  const image = useImage(props);
  return (
    <NodeViewWrapper
      as="span"
      data-image=""
      data-selected={image.selected}
      className="note-image note-image-inline"
      style={image.style}
    >
      <ImageFrame
        props={props}
        shown={image.shown}
        start={image.start}
        frame={image.frame}
        setFrame={image.setFrame}
      />
    </NodeViewWrapper>
  );
}
