// The block the pointer is over, drawn with a soft background (comp 05). The
// handle (`block-handle.tsx`) says which block; this draws it.
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const blockHoverKey = new PluginKey<number | null>('noteBlockHover');

export const BlockHover = Extension.create({
  name: 'blockHover',

  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: blockHoverKey,
        state: {
          init: () => null,
          apply(tr, pos) {
            const meta = tr.getMeta(blockHoverKey) as number | null | undefined;
            if (meta !== undefined) return meta;
            return pos !== null && tr.docChanged ? tr.mapping.map(pos) : pos;
          },
        },
        props: {
          decorations(state) {
            const pos = blockHoverKey.getState(state);
            const node =
              pos === null || pos === undefined ? null : state.doc.nodeAt(pos);
            if (pos === null || pos === undefined || !node) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, {
                class: 'note-block-hovered',
              }),
            ]);
          },
        },
      }),
    ];
  },
});
