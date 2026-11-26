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
import { HIGHLIGHTS } from '../note-style';
import { Indent } from './indent';
import { KeelDetails } from './toggle';

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

export function noteExtensions(placeholder?: string): Extensions {
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
    ...(placeholder === undefined
      ? []
      : [Placeholder.configure({ placeholder })]),
  ];
}
