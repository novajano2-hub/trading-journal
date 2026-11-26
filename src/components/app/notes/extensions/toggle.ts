// Toggles and toggle headings. A toggle is the collapsible section's node
// (`details`: a title and the blocks under it) with a `toggle` value: 0 is a
// title in body text, 1 to 3 a title set as a heading. A collapsible section
// has no value and keeps its own look. The toolbar's style and insert menus,
// and the slash menu, share the two commands below.
import { Details } from '@tiptap/extension-details';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

export type ToggleLevel = 0 | 1 | 2 | 3;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    keelToggle: {
      /**
       * Makes the block the caret is in a toggle of this level, taking its text
       * as the title (several blocks fold under an empty title). In a title
       * already of this level, it turns the toggle back into plain blocks; in
       * a title of another level, it changes the level.
       */
      setToggle: (level: ToggleLevel) => ReturnType;
      /** Puts a new toggle below the caret's block, or in place of an empty one. */
      insertToggle: (level: ToggleLevel) => ReturnType;
    };
  }
}

const level = (value: unknown): ToggleLevel | null => {
  const n = Number(value);
  return value !== null && value !== undefined && [0, 1, 2, 3].includes(n)
    ? (n as ToggleLevel)
    : null;
};

export const KeelDetails = Details.extend({
  addAttributes() {
    return {
      ...(this.parent?.() as Record<string, unknown> | undefined),
      toggle: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          level(element.getAttribute('data-toggle')),
        renderHTML: (attributes: Record<string, unknown>) => {
          const n = level(attributes.toggle);
          return n === null ? {} : { 'data-toggle': String(n) };
        },
      },
    };
  },

  // The stock node view builds its element once; keep `data-toggle` current
  // when a toggle changes level in place.
  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    return (props) => {
      const view = parent(props);
      const update = view.update;
      view.update = (node: ProseNode, ...rest) => {
        const ok = update?.(node, ...rest) ?? false;
        const n = level(node.attrs.toggle);
        const dom = view.dom as HTMLElement;
        if (ok && n === null) dom.removeAttribute('data-toggle');
        else if (ok) dom.setAttribute('data-toggle', String(n));
        return ok;
      };
      return view;
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),

      setToggle:
        (to: ToggleLevel) =>
        ({ state, tr, dispatch, commands }) => {
          const { schema, selection } = state;
          const { details, detailsSummary, detailsContent, paragraph } =
            schema.nodes;
          if (!details || !detailsSummary || !detailsContent || !paragraph)
            return false;
          const { $from, $to } = selection;

          // In a title: switch its level, or turn the toggle back into blocks.
          if ($from.parent.type === detailsSummary) {
            const depth = $from.depth - 1;
            const toggle = $from.node(depth);
            if (level(toggle.attrs.toggle) === to)
              return commands.unsetDetails();
            if (dispatch)
              tr.setNodeMarkup($from.before(depth), undefined, {
                ...toggle.attrs,
                toggle: to,
              });
            return true;
          }

          // One paragraph or heading: its text becomes the title.
          const parent = $from.parent;
          if (
            $from.sameParent($to) &&
            (parent.type.name === 'paragraph' || parent.type.name === 'heading')
          ) {
            const depth = $from.depth;
            const index = $from.index(depth - 1);
            if (
              !$from.node(depth - 1).canReplaceWith(index, index + 1, details)
            )
              return false;
            if (dispatch) {
              const texts: ProseNode[] = [];
              parent.forEach((child) => {
                if (child.isText) texts.push(child);
              });
              const title = detailsSummary.create(
                null,
                Fragment.fromArray(texts),
              );
              const node = details.create({ open: true, toggle: to }, [
                title,
                detailsContent.create(null, paragraph.create()),
              ]);
              const start = $from.before(depth);
              tr.replaceWith(start, $from.after(depth), node);
              tr.setSelection(
                TextSelection.create(
                  tr.doc,
                  start + 2 + Math.min($from.parentOffset, title.content.size),
                  start + 2 + Math.min($to.parentOffset, title.content.size),
                ),
              );
              tr.scrollIntoView();
            }
            return true;
          }

          // Several blocks: they fold under a new, empty title.
          const range = $from.blockRange($to);
          if (!range) return false;
          if (
            !range.parent.canReplaceWith(
              range.startIndex,
              range.endIndex,
              details,
            )
          )
            return false;
          const slice = state.doc.slice(range.start, range.end);
          if (
            !detailsContent.contentMatch.matchFragment(slice.content)?.validEnd
          )
            return false;
          if (dispatch) {
            const node = details.create({ open: true, toggle: to }, [
              detailsSummary.create(),
              detailsContent.create(null, slice.content),
            ]);
            tr.replaceWith(range.start, range.end, node);
            tr.setSelection(
              TextSelection.near(tr.doc.resolve(range.start + 2)),
            );
            tr.scrollIntoView();
          }
          return true;
        },

      insertToggle:
        (to: ToggleLevel) =>
        ({ state, tr, dispatch, commands }) => {
          const { schema, selection } = state;
          const { details, detailsSummary, detailsContent, paragraph } =
            schema.nodes;
          if (!details || !detailsSummary || !detailsContent || !paragraph)
            return false;
          const { $from } = selection;
          const parent = $from.parent;
          if (!parent.isTextblock) return false;
          if (
            parent.type === paragraph &&
            parent.content.size === 0 &&
            commands.setToggle(to)
          )
            return true;
          const depth = $from.depth;
          const index = $from.indexAfter(depth - 1);
          if (!$from.node(depth - 1).canReplaceWith(index, index, details))
            return false;
          if (dispatch) {
            const at = $from.after(depth);
            tr.insert(
              at,
              details.create({ open: true, toggle: to }, [
                detailsSummary.create(),
                detailsContent.create(null, paragraph.create()),
              ]),
            );
            tr.setSelection(TextSelection.create(tr.doc, at + 2));
            tr.scrollIntoView();
          }
          return true;
        },
    };
  },
});
