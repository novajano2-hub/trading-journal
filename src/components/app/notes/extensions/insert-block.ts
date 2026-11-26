// Putting a block node into the note: where the caret is, in place of an empty
// paragraph or after a written one, with a paragraph left below it so the caret
// has somewhere to go. One rule for columns, a page break, an equation and an
// embed.
import type { Node as ProseNode, NodeType, Schema } from '@tiptap/pm/model';
import { Selection, type Transaction } from '@tiptap/pm/state';

/** Where a block of this type goes for the position `at`, or null when the note has no room for it there. */
export function blockSlot(
  doc: ProseNode,
  at: number,
  type: NodeType,
): { from: number; to: number } | null {
  const $at = doc.resolve(at);
  if ($at.parent.isTextblock) {
    if ($at.depth < 1) return null;
    const container = $at.node($at.depth - 1);
    const index = $at.index($at.depth - 1);
    // An empty paragraph gives its place; a written one keeps it, and the block goes below.
    if ($at.parent.content.size === 0)
      return container.canReplaceWith(index, index + 1, type)
        ? { from: $at.before(), to: $at.after() }
        : null;
    return container.canReplaceWith(index + 1, index + 1, type)
      ? { from: $at.after(), to: $at.after() }
      : null;
  }
  const index = $at.index();
  return $at.parent.canReplaceWith(index, index, type)
    ? { from: at, to: at }
    : null;
}

/**
 * Inserts `node` at `at` (see `blockSlot`) and a paragraph after it when
 * nothing follows, then puts the caret in the next text. Returns where the
 * node ends, or null when it has no place there.
 */
export function insertBlock(
  tr: Transaction,
  schema: Schema,
  at: number,
  node: ProseNode,
): number | null {
  const slot = blockSlot(tr.doc, at, node.type);
  if (!slot) return null;
  tr.replaceWith(slot.from, slot.to, node);
  const end = slot.from + node.nodeSize;
  if (tr.doc.resolve(end).nodeAfter === null && schema.nodes.paragraph)
    tr.insert(end, schema.nodes.paragraph.create());
  tr.setSelection(Selection.near(tr.doc.resolve(end), 1));
  return end;
}
