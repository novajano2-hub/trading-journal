// The note editor's extensions, in one list so the editor and its tests build
// the same schema. The slash menu is added by `NoteEditor`, which owns its
// bridge to React.
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import {
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style';
import { Mathematics } from '@tiptap/extension-mathematics';
import { HIGHLIGHTS } from '../note-style';
import { BlockHover } from './block-hover';
import { KeelBlocks } from './blocks';
import { createBlockLink, type BlockBridge } from './blocks-model';
import { Column, Columns } from './columns';
import { createEmoji, type EmojiItem } from './emoji';
import { NoteImage, NoteInlineImage } from './image';
import type { ImageBridge } from './image-model';
import { Indent } from './indent';
import { DayLink, TradeLink } from './link-chip';
import { PageBreak } from './page-break';
import type { MenuBridge } from './suggestion-render';
import { TimedItem, TimedList } from './timed-list';
import { KeelDetails } from './toggle';
import { Tweet } from './tweet';
import { KeelYoutube } from './youtube';

// The shortcut paints Keel's first highlight, as the menu's first swatch.
const KeelHighlight = Highlight.extend({
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-h': () =>
        this.editor.commands.toggleHighlight({ color: HIGHLIGHTS[0]!.value }),
    };
  },
}).configure({ multicolor: true });

// Up or down, the other goes: they cannot stack.
const KeelSuperscript = Superscript.extend({
  excludes: 'superscript subscript',
});
const KeelSubscript = Subscript.extend({ excludes: 'subscript superscript' });

/**
 * `images` is the editor's bridge to the code that stores a note's images
 * (paste, drop and the picker call it); left out, a note shows images but
 * takes none. `blocks` is the bridge of the blocks that need the app around
 * them (the time of a timed item, the dialogs for a link, an equation or an
 * embed); left out, the browser's clock stamps and no block asks for a dialog.
 * `emojiMenu` draws the ":" menu; left out, ":" does nothing.
 */
export function noteExtensions(
  placeholder?: string,
  images: Partial<ImageBridge> = {},
  blocks: Partial<BlockBridge> = {},
  emojiMenu: () => MenuBridge<EmojiItem> | undefined = () => undefined,
): Extensions {
  // One bridge with an answer for everything, whatever the host gave.
  const link = createBlockLink();
  link.provide(blocks);
  const bridge = () => link.bridge;
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    KeelDetails.configure({
      persist: true,
      renderToggleButton: ({ element, isOpen }) => {
        element.setAttribute(
          'aria-label',
          isOpen ? 'Collapse section' : 'Expand section',
        );
        element.setAttribute('aria-expanded', String(isOpen));
      },
    }),
    DetailsSummary,
    DetailsContent,
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    KeelHighlight,
    KeelSuperscript,
    KeelSubscript,
    // Start and End follow the writing direction; the four keys are Tiptap's.
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify', 'start', 'end'],
    }),
    Indent,
    NoteImage.configure({ bridge: () => images }),
    NoteInlineImage,
    Columns,
    Column,
    PageBreak,
    TimedList.configure({ bridge }),
    TimedItem.configure({ bridge }),
    TradeLink,
    DayLink,
    // KaTeX raises on a formula it cannot read, and the view then shows the
    // formula's own text under an error class: a bad one never stops the note.
    Mathematics.configure({
      katexOptions: { throwOnError: true, maxExpand: 1000 },
      inlineOptions: {
        onClick: (node, pos) => {
          link.bridge.ask({
            kind: 'equation',
            at: pos,
            inline: true,
            node: { pos, latex: String(node.attrs.latex ?? '') },
          });
        },
      },
      blockOptions: {
        onClick: (node, pos) => {
          link.bridge.ask({
            kind: 'equation',
            at: pos,
            inline: false,
            node: { pos, latex: String(node.attrs.latex ?? '') },
          });
        },
      },
    }),
    KeelYoutube,
    Tweet,
    createEmoji(emojiMenu),
    KeelBlocks.configure({ bridge }),
    BlockHover,
    ...(placeholder === undefined
      ? []
      : [Placeholder.configure({ placeholder })]),
  ];
}
