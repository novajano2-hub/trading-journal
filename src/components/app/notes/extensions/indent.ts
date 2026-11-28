// Indent for paragraphs and headings. Tiptap has no stock one: a block takes
// an `indent` of 0 to 8, each step 24px of margin at the start of the line (the
// start, so it follows the writing direction). In a list the same two
// commands sink and lift the item instead, as Tab does.
import { Extension, type CommandProps } from '@tiptap/core';

export const INDENT_STEP = 24;
export const INDENT_MAX = 8;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      /** One step in: a block's margin grows, a list item nests under the one above. */
      indent: () => ReturnType;
      /** One step out: the reverse. */
      outdent: () => ReturnType;
    };
  }
}

const clamp = (n: number) => Math.max(0, Math.min(INDENT_MAX, Math.trunc(n)));

export const Indent = Extension.create<{ types: string[] }>({
  name: 'indent',

  addOptions() {
    return { types: ['paragraph', 'heading'] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const n = Number(element.getAttribute('data-indent'));
              return Number.isFinite(n) ? clamp(n) : 0;
            },
            renderHTML: (attributes) => {
              const n = clamp(Number(attributes.indent) || 0);
              return n === 0
                ? {}
                : {
                    'data-indent': String(n),
                    style: `margin-inline-start: ${n * INDENT_STEP}px`,
                  };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    const step =
      (delta: 1 | -1) =>
      () =>
      ({ editor, state, tr, dispatch, commands }: CommandProps) => {
        const item = editor.isActive('taskItem') ? 'taskItem' : 'listItem';
        if (editor.isActive(item))
          return delta > 0
            ? commands.sinkListItem(item)
            : commands.liftListItem(item);
        let changed = false;
        const { from, to } = state.selection;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!this.options.types.includes(node.type.name)) return true;
          const now = Number(node.attrs.indent) || 0;
          const next = clamp(now + delta);
          if (next !== now) {
            changed = true;
            if (dispatch)
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
          }
          return false;
        });
        return changed;
      };
    return { indent: step(1), outdent: step(-1) };
  },

  addKeyboardShortcuts() {
    // The browsers' back and forward keys on a Mac: inside the note they indent.
    return {
      'Mod-]': () => {
        this.editor.commands.indent();
        return true;
      },
      'Mod-[': () => {
        this.editor.commands.outdent();
        return true;
      },
    };
  },
});
