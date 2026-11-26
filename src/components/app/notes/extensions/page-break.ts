// A page break (spec §5.6, B36): a dashed rule in the editor, and the place
// where the PDF starts a new page (`break-after: page` in note-prose.css).
import { Node } from '@tiptap/core';
import { insertBlock } from './insert-block';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    keelPageBreak: {
      /** Puts a page break where the caret is. */
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },
  renderHTML() {
    return ['div', { 'data-type': 'page-break' }];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ state, tr, editor }) => {
          if (!editor.isEditable) return false;
          // `tr` is a scratch one when this only asks whether it can.
          return (
            insertBlock(
              tr,
              state.schema,
              state.selection.to,
              this.type.create(),
            ) !== null
          );
        },
    };
  },
});
