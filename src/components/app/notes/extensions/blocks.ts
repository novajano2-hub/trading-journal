// What the blocks share (Task 20 part B): the commands that ask the host for a
// dialog (a trade or a day to link, an equation, an address to embed), moving
// and deleting a block (B54), the keys that move one, and the paste that offers
// to embed a YouTube or X address (B42). The dialogs themselves are React, in
// `note-blocks.tsx`; this reaches them through the bridge (`blocks-model.ts`).
import { Extension } from '@tiptap/core';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from '@tiptap/pm/state';
import type { BlockBridge, BlockKind } from './blocks-model';
import { parseEmbedUrl } from './embed-urls';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    keelBlocks: {
      /** Opens the trade search; the chosen trade goes in as a chip. */
      askTrade: () => ReturnType;
      /** Opens the date picker; the chosen day goes in as a chip. */
      askDay: () => ReturnType;
      /** Opens the equation box: a block on its own line, or in the line of text. */
      askEquation: (inline?: boolean) => ReturnType;
      /** Opens the box that takes the address of a video or a post. */
      askEmbed: (embed: 'youtube' | 'tweet') => ReturnType;
      /**
       * Moves a block one place up or down among the blocks beside it. The block
       * is the one at `pos` (the position before it), or the one the caret is in.
       */
      moveBlock: (direction: 'up' | 'down', pos?: number) => ReturnType;
      /** Removes the block at `pos`, or the one the caret is in. */
      deleteBlock: (pos?: number) => ReturnType;
    };
  }
  interface Storage {
    keelBlocks: { canAsk: (kind: BlockKind) => boolean };
  }
}

interface Options {
  /** A getter, because Tiptap copies a plain object given as an option. */
  bridge: () => BlockBridge;
}

/** Blocks sit beside each other in these; a block is moved among its neighbours there. */
const CONTAINERS = new Set(['doc', 'column', 'detailsContent']);

/** The position before the block the selection is in, among its neighbours, or null. */
export function blockPosOf(state: EditorState): number | null {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.isBlock)
    return selection.from;
  const { $from } = selection;
  for (let d = $from.depth; d >= 1; d--)
    if (CONTAINERS.has($from.node(d - 1).type.name)) return $from.before(d);
  return null;
}

const OFFER = new PluginKey('noteEmbedOffer');

export const KeelBlocks = Extension.create<Options>({
  name: 'keelBlocks',

  addOptions() {
    return {
      bridge: () => ({
        now: () => '',
        ask: () => false,
        canAsk: () => false,
        offer: () => false,
      }),
    };
  },

  addStorage() {
    const bridge = this.options.bridge;
    return { canAsk: (kind: BlockKind) => bridge().canAsk(kind) };
  },

  addCommands() {
    const bridge = this.options.bridge;
    return {
      askTrade:
        () =>
        ({ state }) =>
          bridge().ask({ kind: 'trade', at: state.selection.to }),
      askDay:
        () =>
        ({ state }) =>
          bridge().ask({ kind: 'day', at: state.selection.to }),
      askEquation:
        (inline = false) =>
        ({ state }) =>
          bridge().ask({ kind: 'equation', at: state.selection.to, inline }),
      askEmbed:
        (embed) =>
        ({ state }) =>
          bridge().ask({ kind: 'embed', embed, at: state.selection.to }),

      moveBlock:
        (direction, pos) =>
        ({ state, tr, dispatch, editor }) => {
          if (!editor.isEditable) return false;
          const at = pos ?? blockPosOf(state);
          if (at === null) return false;
          const $at = state.doc.resolve(at);
          const node = $at.nodeAfter;
          if (!node) return false;
          const index = $at.index();
          const next = direction === 'up' ? index - 1 : index + 1;
          if (next < 0 || next >= $at.parent.childCount) return false;
          if (!dispatch) return true;
          const neighbour = $at.parent.child(next);
          const { selection } = state;
          const carried =
            selection.from >= at && selection.to <= at + node.nodeSize;
          tr.delete(at, at + node.nodeSize);
          const target =
            direction === 'up'
              ? at - neighbour.nodeSize
              : at + neighbour.nodeSize;
          tr.insert(target, node);
          // The caret goes with the block it is in.
          if (carried)
            tr.setSelection(
              selection instanceof NodeSelection
                ? NodeSelection.create(tr.doc, target)
                : TextSelection.create(
                    tr.doc,
                    target + (selection.anchor - at),
                    target + (selection.head - at),
                  ),
            );
          tr.scrollIntoView();
          return true;
        },

      deleteBlock:
        (pos) =>
        ({ state, tr, dispatch, editor }) => {
          if (!editor.isEditable) return false;
          const at = pos ?? blockPosOf(state);
          const node = at === null ? null : state.doc.nodeAt(at);
          if (at === null || !node) return false;
          if (dispatch) {
            tr.delete(at, at + node.nodeSize);
            // A note is never left without a block to type in.
            if (tr.doc.childCount === 0 && state.schema.nodes.paragraph)
              tr.insert(0, state.schema.nodes.paragraph.create());
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-ArrowUp': () => {
        this.editor.commands.moveBlock('up');
        return true;
      },
      'Mod-Shift-ArrowDown': () => {
        this.editor.commands.moveBlock('down');
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const bridge = this.options.bridge;
    return [
      new Plugin({
        key: OFFER,
        props: {
          // A lone YouTube or X address pasted at the caret goes in as a link,
          // and the host is asked whether to embed it. Anything else is the
          // editor's own paste.
          handlePaste: (view, event) => {
            if (!this.editor.isEditable) return false;
            const text = (
              event.clipboardData?.getData('text/plain') ?? ''
            ).trim();
            const embed = parseEmbedUrl(text);
            if (!embed) return false;
            const { selection, schema } = view.state;
            const parent = selection.$from.parent;
            if (
              !selection.empty ||
              !parent.isTextblock ||
              parent.type.spec.code ||
              !schema.marks.link ||
              !bridge().canAsk('embed')
            )
              return false;
            const from = selection.from;
            const tr = view.state.tr
              .insertText(text, from)
              .addMark(
                from,
                from + text.length,
                schema.marks.link.create({ href: text }),
              );
            view.dispatch(tr);
            event.preventDefault();
            bridge().offer({ embed, from, to: from + text.length });
            return true;
          },
        },
      }),
    ];
  },
});
