// Columns (spec §5.6, B36): a layout of two or three columns side by side,
// each a block with its own blocks inside. The count is the number of columns
// the node holds, so the layout needs no attribute of its own; the stylesheet
// lays out however many there are and stacks them on a phone.
import { Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { insertBlock } from './insert-block';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    keelColumns: {
      /** Puts a layout of two or three columns where the caret is, and the caret in its first column. */
      insertColumns: (count: 2 | 3) => ReturnType;
    };
  }
}

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  // A column is its own place: Backspace at its start does not pull it into the one before.
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },
  renderHTML() {
    return ['div', { 'data-type': 'column' }, 0];
  },
});

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,3}',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },
  renderHTML() {
    return ['div', { 'data-type': 'columns' }, 0];
  },

  addCommands() {
    return {
      insertColumns:
        (count) =>
        ({ state, tr, dispatch, editor }) => {
          if (!editor.isEditable || (count !== 2 && count !== 3)) return false;
          const { schema, selection } = state;
          const { columns, column, paragraph } = schema.nodes;
          if (!columns || !column || !paragraph) return false;
          // A column holds blocks, not another layout.
          for (let d = selection.$to.depth; d > 0; d--)
            if (selection.$to.node(d).type === column) return false;
          const node = columns.create(
            null,
            Array.from({ length: count }, () =>
              column.create(null, paragraph.create()),
            ),
          );
          // `tr` is a scratch one when this only asks whether it can.
          const end = insertBlock(tr, schema, selection.to, node);
          if (end === null) return false;
          if (dispatch)
            // Inside the layout, then its first column, then its paragraph.
            tr.setSelection(
              TextSelection.near(tr.doc.resolve(end - node.nodeSize + 3)),
            ).scrollIntoView();
          return true;
        },
    };
  },
});
