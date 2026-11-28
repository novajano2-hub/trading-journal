// A note's images (spec §5.6, B32): a block image with a caption, and an inline
// image in a line of text. Both store `src: "keel-file:<id>"` and a width
// percentage; the bytes live in the file store. The block image also owns the
// editor's two ways in: paste and drop hand image files to `bridge.take`, and
// the `pickImage` command (the Insert menu, the slash menu) asks the host for
// its file picker. The host (`NoteEditor`) stores the files and inserts the
// nodes; the extension never reads a file itself.
import { Node } from '@tiptap/core';
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageView, InlineImageView } from '../image-view';
import { imageFiles, widthOf, type ImageBridge } from './image-model';

export interface ImageAttrs {
  src: string;
  alt?: string;
  width?: number | null;
  caption?: string;
}

declare module '@tiptap/core' {
  interface Storage {
    image: { canPick: () => boolean };
  }
  interface Commands<ReturnType> {
    noteImage: {
      /** Asks the host to open its file picker for a block image, or an inline one. */
      pickImage: (inline?: boolean) => ReturnType;
      /** Moves the caret to `pos` (the nearest place that takes a caret). */
      caretAt: (pos: number) => ReturnType;
    };
  }
}

interface Options {
  /** A getter: Tiptap copies a plain object given as an option, and the bridge must stay the one the editor fills in. */
  bridge: () => Partial<ImageBridge>;
}

const attrsOf = (el: HTMLElement) => {
  const img = el.querySelector('img');
  return {
    src: img?.getAttribute('src') ?? null,
    alt: img?.getAttribute('alt') ?? '',
    width: widthOf(el.getAttribute('data-width')),
  };
};

const sharedAttributes = {
  src: { default: null },
  alt: { default: '' },
  width: { default: null as number | null },
};

const IMAGE_PASTE = new PluginKey('noteImagePaste');

export const NoteImage = Node.create<Options>({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  // Moved by the block handle (Task 20, part B), not by dragging the picture.
  draggable: false,

  addOptions() {
    return { bridge: () => ({}) };
  },

  // What a menu asks before it offers Image: whether the note takes images.
  addStorage() {
    const bridge = this.options.bridge;
    return {
      canPick: () => bridge().canPick?.() ?? bridge().pick !== undefined,
    };
  },

  addAttributes() {
    return {
      ...sharedAttributes,
      caption: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-keel-image]',
        getAttrs: (el) => ({
          ...attrsOf(el),
          caption: el.querySelector('figcaption')?.textContent ?? '',
        }),
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, width, caption } = node.attrs as Required<ImageAttrs>;
    const w = widthOf(width);
    return [
      'figure',
      {
        'data-keel-image': '',
        ...(w !== null
          ? { 'data-width': String(w), style: `width: ${w}%` }
          : {}),
      },
      ['img', { src, alt }],
      ...(caption ? ([['figcaption', caption]] as const) : []),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },

  addCommands() {
    return {
      pickImage:
        (inline = false) =>
        () =>
          this.options.bridge().pick?.(inline) ?? false,
      caretAt:
        (pos) =>
        ({ tr, dispatch }) => {
          const at = Math.max(0, Math.min(pos, tr.doc.content.size));
          if (dispatch) tr.setSelection(Selection.near(tr.doc.resolve(at), 1));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const bridge = this.options.bridge;
    return [
      new Plugin({
        key: IMAGE_PASTE,
        props: {
          // A picture on the clipboard (a screenshot, a copied image). A copied
          // sheet or page carries a picture beside its text: that stays text.
          handlePaste: (_view, event) => {
            const files = imageFiles(event.clipboardData?.files);
            if (files.length === 0) return false;
            const text = event.clipboardData?.getData('text/plain') ?? '';
            if (text.trim() !== '') return false;
            // A note that cannot take images leaves the paste to the editor.
            if (!bridge().take?.(files)) return false;
            event.preventDefault();
            return true;
          },
          // Files dragged in from the desktop. A node moved inside the note is
          // the editor's own business.
          handleDrop: (view, event, _slice, moved) => {
            if (moved) return false;
            const files = imageFiles(event.dataTransfer?.files);
            if (files.length === 0) return false;
            const at = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (!bridge().take?.(files, at ? { pos: at.pos } : undefined))
              return false;
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
});

export const NoteInlineImage = Node.create({
  name: 'inlineImage',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { ...sharedAttributes };
  },

  parseHTML() {
    return [
      { tag: 'span[data-keel-inline-image]', getAttrs: (el) => attrsOf(el) },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, width } = node.attrs as Required<ImageAttrs>;
    const w = widthOf(width);
    return [
      'span',
      {
        'data-keel-inline-image': '',
        ...(w !== null
          ? { 'data-width': String(w), style: `width: ${w}%` }
          : {}),
      },
      ['img', { src, alt }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineImageView);
  },
});
