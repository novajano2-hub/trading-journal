'use client';

// The note editor's toolbar, in Keel's own groups: history; text (style, font,
// size); marks (bold, italic, underline, link and a Format menu); colour and
// highlight; a paragraph menu; insert, with the host's template menu beside
// it. Template, version history, full screen and dictation take a place only
// where a host passes what they need: the toolbar draws no control that does
// nothing.
//
// Every menu is built from one list of entries (`Entry`), so the desktop menu,
// the phone's More menu and the tests all read the same thing. Each item names
// the editor library's key binding where there is one, in Tiptap's notation
// ("Mod-Shift-7"), shown as the platform writes it.
import { useRef, useState } from 'react';
import { DropdownMenu, Toolbar } from 'radix-ui';
import { isMacOS } from '@tiptap/core';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  ArrowsIn,
  ArrowsOut,
  CaretDown,
  CaretRight,
  Check,
  ClockCounterClockwise,
  DotsThree,
  FileText,
  Highlighter,
  LinkSimple,
  Microphone,
  Plus,
  TextAUnderline,
  TextAlignCenter,
  TextAlignJustify,
  TextAlignLeft,
  TextAlignRight,
  TextB,
  TextItalic,
  TextUnderline,
} from '@phosphor-icons/react/dist/ssr';
import { usePhone } from '@/lib/use-phone';
import { leaveToggle } from './extensions/toggle';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHTS,
  TEXT_COLOURS,
} from './note-style';

type Chain = ReturnType<Editor['chain']>;

// ---------------------------------------------------------------------------
// Key bindings, as the platform writes them.

const MOD_NAMES: Record<string, { pc: string; mac: string }> = {
  Mod: { pc: 'Ctrl', mac: '⌘' },
  Shift: { pc: 'Shift', mac: '⇧' },
  Alt: { pc: 'Alt', mac: '⌥' },
};

/** Named keys as a keyboard prints them; a letter or a digit is its capital. */
const KEY_SYMBOLS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** "Mod-Shift-7" as it reads on the keyboard: "Ctrl+Shift+7", or "⌘⇧7" on a Mac. */
export function keyLabel(keys: string): string {
  const mac = isMacOS();
  const parts = keys.split('-');
  const raw = parts.pop() ?? '';
  const key = KEY_SYMBOLS[raw] ?? raw.toUpperCase();
  const mods = parts.map((m) => MOD_NAMES[m]?.[mac ? 'mac' : 'pc'] ?? m);
  return mac ? `${mods.join('')}${key}` : [...mods, key].join('+');
}

/** The same binding for `aria-keyshortcuts` ("Control+Shift+7", "Meta+Shift+ArrowUp"). */
export function ariaKeys(keys: string): string {
  const parts = keys.split('-');
  const raw = parts.pop() ?? '';
  const key = raw.length === 1 ? raw.toUpperCase() : raw;
  const mod = isMacOS() ? 'Meta' : 'Control';
  return [...parts.map((m) => (m === 'Mod' ? mod : m)), key].join('+');
}

// ---------------------------------------------------------------------------
// What the toolbar reads from the editor.

interface BarState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  sup: boolean;
  sub: boolean;
  link: boolean;
  /** The id of the style menu's item for this block, or a name of its own for a block the menu does not list. */
  style: string;
  styleLabel: string;
  family: string;
  size: number;
  colour: string | null;
  highlight: string | null;
  align: string;
  /** A paragraph or heading is in the selection: alignment has somewhere to go. */
  canAlign: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canIndent: boolean;
  canOutdent: boolean;
  /** Where the caret is, each of these has room for what it makes. */
  canToggle: boolean;
  canInsertToggle: boolean;
  canTable: boolean;
  canRule: boolean;
  canColumns: boolean;
  canPageBreak: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/** The block the caret is in, as the style menu names it. */
function styleOf(e: Editor): { id: string; label: string } {
  const { $from } = e.state.selection;
  if ($from.parent.type.name === 'detailsSummary') {
    const n = $from.node($from.depth - 1).attrs.toggle as number | null;
    if (n === 1 || n === 2 || n === 3)
      return { id: `toggle-${n}`, label: `Toggle heading ${n}` };
    if (n === 0) return { id: 'toggle', label: 'Toggle' };
    return { id: 'section', label: 'Section title' };
  }
  for (const n of [1, 2, 3])
    if (e.isActive('heading', { level: n }))
      return { id: `h${n}`, label: `Heading ${n}` };
  if (e.isActive('bulletList')) return { id: 'bullet', label: 'Bulleted list' };
  if (e.isActive('orderedList'))
    return { id: 'ordered', label: 'Numbered list' };
  if (e.isActive('taskList')) return { id: 'task', label: 'Checklist' };
  if (e.isActive('blockquote')) return { id: 'quote', label: 'Quote' };
  if (e.isActive('codeBlock')) return { id: 'code', label: 'Code block' };
  return { id: 'normal', label: 'Normal text' };
}

/** The size at the caret: the one set on the text, else what the block is drawn at. */
function sizeOf(e: Editor): number {
  const set = parseFloat(String(e.getAttributes('textStyle').fontSize ?? ''));
  if (Number.isFinite(set)) return Math.round(set);
  try {
    const { node } = e.view.domAtPos(e.state.selection.from);
    const el = node instanceof Element ? node : node.parentElement;
    const px = el ? parseFloat(getComputedStyle(el).fontSize) : NaN;
    if (Number.isFinite(px) && px > 0) return Math.round(px);
  } catch {
    // The view is not mounted yet: the body size below.
  }
  return 15;
}

const ALIGNMENTS = ['left', 'center', 'right', 'justify', 'start', 'end'];

function readState(e: Editor): BarState {
  const { id, label } = styleOf(e);
  let canAlign = false;
  const { from, to } = e.state.selection;
  e.state.doc.nodesBetween(from, to, (n) => {
    if (n.type.name === 'paragraph' || n.type.name === 'heading')
      canAlign = true;
    return !canAlign;
  });
  const text = e.getAttributes('textStyle');
  const family = FONT_FAMILIES.find(
    (f) => f.value !== null && f.value === text.fontFamily,
  );
  return {
    bold: e.isActive('bold'),
    italic: e.isActive('italic'),
    underline: e.isActive('underline'),
    strike: e.isActive('strike'),
    code: e.isActive('code'),
    sup: e.isActive('superscript'),
    sub: e.isActive('subscript'),
    link: e.isActive('link'),
    style: id,
    styleLabel: label,
    family: family?.id ?? 'sans',
    size: sizeOf(e),
    colour: (text.color as string | null | undefined) ?? null,
    highlight:
      (e.getAttributes('highlight').color as string | null | undefined) ?? null,
    align: ALIGNMENTS.find((a) => e.isActive({ textAlign: a })) ?? 'left',
    canAlign,
    canUndo: e.can().undo(),
    canRedo: e.can().redo(),
    canIndent: e.can().indent(),
    canOutdent: e.can().outdent(),
    canToggle: e.can().setToggle(0),
    canInsertToggle: e.can().insertToggle(0),
    canTable: e.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    canRule: e.can().setHorizontalRule(),
    canColumns: e.can().insertColumns(2),
    canPageBreak: e.can().setPageBreak(),
    canMoveUp: e.can().moveBlock('up'),
    canMoveDown: e.can().moveBlock('down'),
  };
}

// ---------------------------------------------------------------------------
// The menus, as lists of entries.

interface Item {
  kind: 'action' | 'radio' | 'check';
  id: string;
  label: string;
  /** In Tiptap's notation, "Mod-Shift-7". */
  keys?: string;
  checked?: boolean;
  disabled?: boolean;
  /** A colour to draw beside the name, and the hue to ring it with. */
  swatch?: string;
  ring?: string;
  /** A line under the name, said to a screen reader as the item's description. */
  description?: string;
  run(c: Chain): Chain;
}
interface Sub {
  kind: 'sub';
  id: string;
  label: string;
  /** What it is set to now, said beside its name. */
  value?: string;
  entries: Entry[];
}
type Entry = Item | Sub | { kind: 'sep' };

const radio = (
  id: string,
  label: string,
  checked: boolean,
  run: Item['run'],
  more: Partial<Item> = {},
): Item => ({ kind: 'radio', id, label, checked, run, ...more });

function styleEntries(s: BarState): Entry[] {
  return [
    radio(
      'normal',
      'Normal text',
      s.style === 'normal',
      (c) => leaveToggle(c).clearNodes(),
      { keys: 'Mod-Alt-0' },
    ),
    ...([1, 2, 3] as const).map((n) =>
      radio(
        `h${n}`,
        `Heading ${n}`,
        s.style === `h${n}`,
        (c) => leaveToggle(c).toggleHeading({ level: n }),
        { keys: `Mod-Alt-${n}` },
      ),
    ),
    ...([1, 2, 3] as const).map((n) =>
      radio(
        `toggle-${n}`,
        `Toggle heading ${n}`,
        s.style === `toggle-${n}`,
        (c) => c.setToggle(n),
        { disabled: !s.canToggle },
      ),
    ),
    radio(
      'bullet',
      'Bulleted list',
      s.style === 'bullet',
      (c) => leaveToggle(c).toggleBulletList(),
      { keys: 'Mod-Shift-8' },
    ),
    radio(
      'ordered',
      'Numbered list',
      s.style === 'ordered',
      (c) => leaveToggle(c).toggleOrderedList(),
      { keys: 'Mod-Shift-7' },
    ),
    // Not in TradeZella's style menu: kept so nothing the old toolbar offered is lost.
    radio(
      'task',
      'Checklist',
      s.style === 'task',
      (c) => leaveToggle(c).toggleTaskList(),
      { keys: 'Mod-Shift-9' },
    ),
    radio(
      'quote',
      'Quote',
      s.style === 'quote',
      (c) => leaveToggle(c).toggleBlockquote(),
      { keys: 'Mod-Shift-b' },
    ),
  ];
}

const fontEntries = (s: BarState): Entry[] =>
  FONT_FAMILIES.map((f) =>
    radio(f.id, f.label, s.family === f.id, (c) =>
      f.value === null ? c.unsetFontFamily() : c.setFontFamily(f.value),
    ),
  );

const sizeEntries = (s: BarState): Entry[] =>
  FONT_SIZES.map((n) =>
    radio(String(n), String(n), s.size === n, (c) => c.setFontSize(`${n}px`)),
  );

const check = (
  id: string,
  label: string,
  checked: boolean,
  run: Item['run'],
  keys?: string,
): Item => ({
  kind: 'check',
  id,
  label,
  checked,
  run,
  ...(keys ? { keys } : {}),
});

/** Every mark the editor has but the link: a link is a thing the text says, not how it looks. */
const clearFormatting = (c: Chain): Chain =>
  c.command(({ editor, commands }) => {
    for (const name of Object.keys(editor.schema.marks))
      if (name !== 'link') commands.unsetMark(name);
    return true;
  });

const formatEntries = (s: BarState): Entry[] => [
  check(
    'strike',
    'Strikethrough',
    s.strike,
    (c) => c.toggleStrike(),
    'Mod-Shift-s',
  ),
  check('code', 'Inline code', s.code, (c) => c.toggleCode(), 'Mod-e'),
  check('sup', 'Superscript', s.sup, (c) => c.toggleSuperscript(), 'Mod-.'),
  check('sub', 'Subscript', s.sub, (c) => c.toggleSubscript(), 'Mod-,'),
  { kind: 'sep' },
  {
    kind: 'action',
    id: 'clear',
    label: 'Clear formatting',
    run: clearFormatting,
  },
];

const colourEntries = (s: BarState): Entry[] => [
  radio('default', 'Default', s.colour === null, (c) => c.unsetColor(), {
    swatch: 'var(--text)',
  }),
  ...TEXT_COLOURS.map((t) =>
    radio(t.id, t.label, s.colour === t.value, (c) => c.setColor(t.value), {
      swatch: t.value,
    }),
  ),
];

const highlightEntries = (s: BarState): Entry[] => [
  radio('none', 'None', s.highlight === null, (c) => c.unsetHighlight()),
  ...HIGHLIGHTS.map((t) =>
    radio(
      t.id,
      t.label,
      s.highlight === t.value,
      (c) => c.setHighlight({ color: t.value }),
      { swatch: t.value, ring: t.ink },
    ),
  ),
];

const ALIGN_ITEMS: { id: string; label: string; keys?: string }[] = [
  { id: 'left', label: 'Left', keys: 'Mod-Shift-l' },
  { id: 'center', label: 'Centre', keys: 'Mod-Shift-e' },
  { id: 'right', label: 'Right', keys: 'Mod-Shift-r' },
  { id: 'justify', label: 'Justify', keys: 'Mod-Shift-j' },
  { id: 'start', label: 'Start' },
  { id: 'end', label: 'End' },
];

const paragraphEntries = (s: BarState): Entry[] => [
  ...ALIGN_ITEMS.map((a) =>
    radio(a.id, a.label, s.align === a.id, (c) => c.setTextAlign(a.id), {
      disabled: !s.canAlign,
      ...(a.keys ? { keys: a.keys } : {}),
    }),
  ),
  { kind: 'sep' },
  {
    kind: 'action',
    id: 'outdent',
    label: 'Outdent',
    keys: 'Mod-[',
    disabled: !s.canOutdent,
    run: (c) => c.outdent(),
  },
  {
    kind: 'action',
    id: 'indent',
    label: 'Indent',
    keys: 'Mod-]',
    disabled: !s.canIndent,
    run: (c) => c.indent(),
  },
  { kind: 'sep' },
  // The keyboard's and the phone's way to move a block: the handles beside a
  // block need a pointer that hovers.
  {
    kind: 'action',
    id: 'move-up',
    label: 'Move up',
    keys: 'Mod-Shift-ArrowUp',
    disabled: !s.canMoveUp,
    run: (c) => c.moveBlock('up'),
  },
  {
    kind: 'action',
    id: 'move-down',
    label: 'Move down',
    keys: 'Mod-Shift-ArrowDown',
    disabled: !s.canMoveDown,
    run: (c) => c.moveBlock('down'),
  },
];

/**
 * What Insert offers, in the comp's groups (comp 05): pictures and the table,
 * the column layouts, then the single blocks. Rows are plain commands; a
 * block adds its own by adding an entry here. `images` and `blocks` say what
 * the host can do (store a picture, show a dialog).
 */
function insertEntries(s: BarState, images: boolean, blocks: boolean): Entry[] {
  const action = (
    id: string,
    label: string,
    run: Item['run'],
    disabled: boolean,
  ): Item => ({ kind: 'action', id, label, run, disabled });
  return [
    // Image and Inline image open the host's file picker (`pickImage`); a
    // note that cannot take images has neither.
    ...(images
      ? [
          action('image', 'Image', (c) => c.pickImage(false), false),
          action(
            'inline-image',
            'Inline image',
            (c) => c.pickImage(true),
            false,
          ),
        ]
      : []),
    action(
      'table',
      'Table',
      (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
      !s.canTable,
    ),
    { kind: 'sep' },
    action(
      'columns-2',
      'Two columns',
      (c) => c.insertColumns(2),
      !s.canColumns,
    ),
    action(
      'columns-3',
      'Three columns',
      (c) => c.insertColumns(3),
      !s.canColumns,
    ),
    { kind: 'sep' },
    action('divider', 'Divider', (c) => c.setHorizontalRule(), !s.canRule),
    action(
      'page-break',
      'Page break',
      (c) => c.setPageBreak(),
      !s.canPageBreak,
    ),
    // The equation box is the host's.
    ...(blocks
      ? [action('equation', 'Equation', (c) => c.askEquation(false), false)]
      : []),
    action('toggle', 'Toggle', (c) => c.insertToggle(0), !s.canInsertToggle),
    ...([1, 2, 3] as const).map((n) =>
      action(
        `toggle-${n}`,
        `Toggle heading ${n}`,
        (c) => c.insertToggle(n),
        !s.canInsertToggle,
      ),
    ),
  ];
}

// ---------------------------------------------------------------------------
// Drawing

const BTN =
  'relative inline-flex h-[30px] min-w-[30px] flex-none items-center justify-center gap-1 rounded-[7px] px-1.5 text-[13px] font-medium whitespace-nowrap text-muted hover:bg-surface-1 hover:text-text aria-pressed:bg-surface-1 aria-pressed:text-accent-ink aria-pressed:shadow-[var(--shadow-chip)] data-[state=open]:bg-surface-1 data-[state=open]:text-text disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:h-11 pointer-coarse:min-w-11';
const TEXT_BTN = `${BTN} px-2 text-text`;
// A menu that is closing takes no pointer: while it fades, Radix would still
// focus an item the pointer passes over, and pull the keyboard back from the
// text. The `!` matters: inside a modal dialog Radix gives the menu an inline
// pointer-events of auto, which a plain class does not beat.
const MENU =
  'z-[60] max-h-(--radix-dropdown-menu-content-available-height) min-w-[200px] max-w-[320px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none data-[state=closed]:pointer-events-none! motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
// On a phone a menu is a sheet from the bottom edge; note-prose.css pins its
// popper wrapper there, and the shadow is the veil over the page.
const SHEET =
  'note-sheet z-[60] data-[state=closed]:pointer-events-none! max-h-[88dvh] w-full overflow-y-auto rounded-t-[16px] border-t border-line bg-surface-1 p-1.5 pb-[calc(10px+env(safe-area-inset-bottom))] text-text shadow-[0_0_0_100vmax_var(--veil)] outline-none';

const itemClass = (phone: boolean, marked: boolean) =>
  `relative flex cursor-pointer items-center gap-2 rounded-[8px] ${
    marked ? 'pl-8' : 'pl-2.5'
  } pr-2.5 text-text outline-none select-none data-[disabled]:cursor-default data-[disabled]:text-faint data-[highlighted]:bg-sunken ${
    phone
      ? 'min-h-12 text-[15px]'
      : 'min-h-9 text-[13.5px] pointer-coarse:min-h-11'
  }`;

function Swatch({ value, ring }: { value: string; ring?: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-4 flex-none rounded-[5px] border border-line-2"
      style={{ background: value, ...(ring ? { borderColor: ring } : {}) }}
    />
  );
}

function ItemBody({ item }: { item: Item }) {
  return (
    <>
      {item.swatch ? <Swatch value={item.swatch} ring={item.ring} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.description ? (
          // Drawn for the eye and left out of the name: the item stays "Dictate".
          <span
            aria-hidden="true"
            className="block text-[12px] leading-snug text-faint"
          >
            {item.description}
          </span>
        ) : null}
      </span>
      {item.keys ? (
        <span
          aria-hidden="true"
          className="ml-auto pl-4 text-[12px] whitespace-nowrap text-faint tabular-nums"
        >
          {keyLabel(item.keys)}
        </span>
      ) : null}
    </>
  );
}

const keyProps = (item: Item) => ({
  ...(item.keys ? { 'aria-keyshortcuts': ariaKeys(item.keys) } : {}),
  ...(item.description ? { 'aria-description': item.description } : {}),
});

/** A menu's entries; neighbouring radios share one group. */
function MenuBody({
  entries,
  phone,
  onPick,
  openedRef,
}: {
  entries: Entry[];
  phone: boolean;
  /** Told when an item is chosen, with the command to run. */
  onPick(run: Item['run'], event: Event): void;
  /** When the menu or sub-menu last opened, for `Menu`'s guard. */
  openedRef: { current: number };
}) {
  const marked = entries.some((e) => e.kind === 'radio' || e.kind === 'check');
  const out: React.ReactNode[] = [];
  for (let i = 0; i < entries.length;) {
    const entry = entries[i]!;
    if (entry.kind === 'sep') {
      out.push(
        <DropdownMenu.Separator
          key={`sep-${i}`}
          className="my-1 h-px bg-line"
        />,
      );
      i++;
    } else if (entry.kind === 'sub') {
      out.push(
        <DropdownMenu.Sub
          key={entry.id}
          onOpenChange={(open) => {
            if (open) openedRef.current = performance.now();
          }}
        >
          <DropdownMenu.SubTrigger
            className={`${itemClass(phone, false)} justify-between`}
          >
            <span>{entry.label}</span>
            <span className="ml-auto flex items-center gap-1 text-[12.5px] text-faint">
              {entry.value}
              <CaretRight size={12} weight="bold" aria-hidden="true" />
            </span>
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent
              aria-label={entry.label}
              collisionPadding={12}
              className={phone ? SHEET : MENU}
            >
              <MenuBody
                entries={entry.entries}
                phone={phone}
                onPick={onPick}
                openedRef={openedRef}
              />
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
        </DropdownMenu.Sub>,
      );
      i++;
    } else if (entry.kind === 'radio') {
      const group: Item[] = [];
      while (i < entries.length && entries[i]!.kind === 'radio')
        group.push(entries[i++] as Item);
      out.push(
        <DropdownMenu.RadioGroup
          key={`radios-${group[0]!.id}`}
          value={group.find((g) => g.checked)?.id ?? ''}
        >
          {group.map((item) => (
            <DropdownMenu.RadioItem
              key={item.id}
              value={item.id}
              disabled={item.disabled}
              onSelect={(e) => onPick(item.run, e)}
              className={itemClass(phone, marked)}
              {...keyProps(item)}
            >
              <DropdownMenu.ItemIndicator className="absolute left-2 inline-flex">
                <Check
                  size={16}
                  aria-hidden="true"
                  className="text-accent-ink"
                />
              </DropdownMenu.ItemIndicator>
              <ItemBody item={item} />
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>,
      );
    } else if (entry.kind === 'check') {
      out.push(
        <DropdownMenu.CheckboxItem
          key={entry.id}
          checked={entry.checked ?? false}
          disabled={entry.disabled}
          onSelect={(e) => onPick(entry.run, e)}
          className={itemClass(phone, marked)}
          {...keyProps(entry)}
        >
          <DropdownMenu.ItemIndicator className="absolute left-2 inline-flex">
            <Check size={16} aria-hidden="true" className="text-accent-ink" />
          </DropdownMenu.ItemIndicator>
          <ItemBody item={entry} />
        </DropdownMenu.CheckboxItem>,
      );
      i++;
    } else {
      out.push(
        <DropdownMenu.Item
          key={entry.id}
          disabled={entry.disabled}
          onSelect={(e) => onPick(entry.run, e)}
          className={itemClass(phone, marked)}
          {...keyProps(entry)}
        >
          <ItemBody item={entry} />
        </DropdownMenu.Item>,
      );
      i++;
    }
  }
  return <>{out}</>;
}

/**
 * Gives the keyboard to the text now, the caret where it was. Not
 * `editor.commands.focus()`: that waits a frame, and a key typed in that frame
 * lands on the menu that is closing.
 */
export function focusText(editor: Editor): void {
  if (!editor.isDestroyed) editor.view.focus();
}

/**
 * One menu from the toolbar. A choice runs on the editor and then focus goes
 * back to the text, the caret where it was; Escape goes back to the button.
 */
function Menu({
  editor,
  phone,
  label,
  title,
  entries,
  trigger,
  narrow = false,
  align = 'start',
}: {
  editor: Editor;
  phone: boolean;
  label: string;
  /** A sheet's heading on a phone. */
  title?: string;
  entries: Entry[];
  trigger: React.ReactElement;
  narrow?: boolean;
  align?: 'start' | 'end';
}) {
  const picked = useRef(false);
  const openedRef = useRef(0);
  return (
    <DropdownMenu.Root
      onOpenChange={(open) => {
        if (open) openedRef.current = performance.now();
      }}
    >
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          aria-label={label}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={`${phone ? SHEET : MENU} ${narrow && !phone ? 'min-w-[96px]' : ''}`}
          onCloseAutoFocus={(e) => {
            if (!picked.current) return;
            picked.current = false;
            e.preventDefault();
            focusText(editor);
          }}
        >
          {phone && title ? (
            <DropdownMenu.Label className="px-2.5 pt-1.5 pb-2 text-[15px] font-semibold">
              {title}
            </DropdownMenu.Label>
          ) : null}
          <MenuBody
            entries={entries}
            phone={phone}
            openedRef={openedRef}
            onPick={(run, event) => {
              // A sheet opens under the pointer that opened it, and Radix
              // chooses an item the pointer is released over: not within the
              // first moments.
              if (phone && performance.now() - openedRef.current < 350) {
                event.preventDefault();
                return;
              }
              picked.current = true;
              run(editor.chain()).run();
              // Back to the text at once, not when the menu has faded: what is
              // typed next must not land on the closing menu's items.
              setTimeout(() => focusText(editor), 0);
            }}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const Caret = () => (
  <CaretDown
    size={10}
    weight="bold"
    aria-hidden="true"
    className="flex-none text-faint"
  />
);
const ICON = { size: 16, 'aria-hidden': true } as const;

const Sep = () => (
  <span aria-hidden="true" className="mx-1 h-[18px] w-px flex-none bg-line-2" />
);

/** A button of the bar that opens a menu. Kept off the editor's focus while the mouse works it. */
function Trigger({
  label,
  className = TEXT_BTN,
  children,
  ...rest
}: { label: string } & React.ComponentProps<'button'>) {
  return (
    <Toolbar.Button
      {...rest}
      type="button"
      aria-label={label}
      className={className}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </Toolbar.Button>
  );
}

/** A plain button of the bar, running one command on the editor. */
function Tool({
  label,
  keys,
  pressed,
  disabled,
  onClick,
  children,
  ...rest
}: {
  label: string;
  keys?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick(event: React.MouseEvent<HTMLButtonElement>): void;
  children: React.ReactNode;
} & Omit<React.ComponentProps<'button'>, 'onClick'>) {
  return (
    <Trigger
      {...rest}
      label={label}
      className={BTN}
      title={keys ? `${label} (${keyLabel(keys)})` : label}
      {...(keys ? { 'aria-keyshortcuts': ariaKeys(keys) } : {})}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Trigger>
  );
}

const ALIGN_ICON: Record<string, typeof TextAlignLeft> = {
  center: TextAlignCenter,
  right: TextAlignRight,
  end: TextAlignRight,
  justify: TextAlignJustify,
};

/** A command that is not the editor's: run it where the chain would. */
const call =
  (fn: () => void): Item['run'] =>
  (c) =>
    c.command(() => {
      fn();
      return true;
    });

/** What a host's template menu is given: the toolbar's button for it, and, where the menu is opened from elsewhere (a phone's More sheet), its open state. */
export interface TemplateSlotProps {
  /** The button that opens the menu: use it as the menu's trigger. */
  trigger: React.ReactElement;
  open?: boolean;
  /** `away`: the menu closed on a choice that opened a dialog of its own, which has the keyboard. */
  onOpenChange?(open: boolean, away?: boolean): void;
  /** Pass to the menu's content: keeps the keyboard in the text as the menu goes (see `TemplateMenu`). */
  onCloseAutoFocus?(event: Event, picked: boolean, away?: boolean): void;
}

/** Draws the host's own template menu on the toolbar's trigger (Insert's group). */
export type TemplateSlot = (props: TemplateSlotProps) => React.ReactNode;

export interface EditorToolbarProps {
  editor: Editor;
  /** Opens the note's version history; `from` is the button that was used. Without it the control is not drawn. */
  onHistory?: (from: HTMLElement | null) => void;
  /** Takes the editor full screen, or out of it. Without it the control is not drawn. */
  onFullScreen?: () => void;
  /** The editor is full screen now: the control says it leaves it. */
  fullScreen?: boolean;
  /** Starts or stops dictation, for a host whose browser has speech recognition. */
  onDictate?: () => void;
  /** Dictation is listening now. */
  dictating?: boolean;
  /** The host's template menu, drawn beside Insert. Without it there is no Template control. */
  templateSlot?: TemplateSlot;
  /** The bar stays at the top of the window while the note scrolls under it (full screen). */
  sticky?: boolean;
  /** The note can take images: Insert offers Image and Inline image. */
  images?: boolean;
  /** The note has the dialogs the blocks ask for: Insert offers Equation. */
  blocks?: boolean;
}

export function EditorToolbar({
  editor,
  onHistory,
  onFullScreen,
  fullScreen = false,
  onDictate,
  dictating = false,
  templateSlot,
  sticky = false,
  images = false,
  blocks = false,
}: EditorToolbarProps): React.JSX.Element {
  const phone = usePhone();
  // A phone's More button is where the host's dialogs open from and return to.
  const [moreButton, setMoreButton] = useState<HTMLButtonElement | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => readState(e),
  });

  const run = (fn: (c: Chain) => Chain) => () =>
    fn(editor.chain().focus()).run();

  const openLink = () => {
    setHref((editor.getAttributes('link').href as string | undefined) ?? '');
    setLinkOpen((o) => !o);
  };
  const applyLink = (e: React.FormEvent) => {
    e.preventDefault();
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url)
      chain
        .setLink({
          href: /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`,
        })
        .run();
    else chain.unsetLink().run();
    setLinkOpen(false);
  };

  const familyName = FONT_FAMILIES.find((f) => f.id === s.family)?.label ?? '';
  const colourName =
    TEXT_COLOURS.find((c) => c.value === s.colour)?.label ?? 'Default';
  const highlightName =
    HIGHLIGHTS.find((c) => c.value === s.highlight)?.label ?? 'None';
  const alignName = ALIGN_ITEMS.find((a) => a.id === s.align)?.label ?? 'Left';
  const AlignIcon = ALIGN_ICON[s.align] ?? TextAlignLeft;

  const menu = (
    label: string,
    entries: Entry[],
    trigger: React.ReactElement,
    more: Partial<React.ComponentProps<typeof Menu>> = {},
  ) => (
    <Menu
      editor={editor}
      phone={phone}
      label={label}
      entries={entries}
      trigger={trigger}
      {...more}
    />
  );

  const history = (
    <>
      <Tool
        label="Undo"
        keys="Mod-z"
        disabled={!s.canUndo}
        onClick={run((c) => c.undo())}
      >
        <ArrowUUpLeft {...ICON} />
      </Tool>
      <Tool
        label="Redo"
        keys="Mod-Shift-z"
        disabled={!s.canRedo}
        onClick={run((c) => c.redo())}
      >
        <ArrowUUpRight {...ICON} />
      </Tool>
    </>
  );

  // On a phone the style button takes what the row has left, and a long name is cut.
  const style = menu(
    'Style',
    styleEntries(s),
    <Trigger
      label={`Style: ${s.styleLabel}`}
      className={phone ? `${TEXT_BTN} min-w-0 flex-1 justify-start` : TEXT_BTN}
    >
      <span className="min-w-0 truncate">{s.styleLabel}</span>
      <Caret />
    </Trigger>,
    { title: 'Style' },
  );

  const marks = (
    <>
      <Tool
        label="Bold"
        keys="Mod-b"
        pressed={s.bold}
        onClick={run((c) => c.toggleBold())}
      >
        <TextB {...ICON} weight="bold" />
      </Tool>
      <Tool
        label="Italic"
        keys="Mod-i"
        pressed={s.italic}
        onClick={run((c) => c.toggleItalic())}
      >
        <TextItalic {...ICON} />
      </Tool>
      <Tool
        label="Underline"
        keys="Mod-u"
        pressed={s.underline}
        onClick={run((c) => c.toggleUnderline())}
      >
        <TextUnderline {...ICON} />
      </Tool>
    </>
  );

  const link = (
    <Tool
      label="Link"
      pressed={s.link}
      aria-expanded={linkOpen}
      onClick={openLink}
    >
      <LinkSimple {...ICON} />
    </Tool>
  );

  const insert = menu(
    'Insert',
    insertEntries(s, images, blocks),
    <Trigger label="Insert">
      <Plus {...ICON} />
      Insert
      <Caret />
    </Trigger>,
    { title: 'Insert' },
  );

  const template = templateSlot
    ? templateSlot(
        phone
          ? {
              // The bar has no room for it: More opens the menu, anchored here.
              trigger: (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="pointer-events-none ml-auto size-0 overflow-hidden opacity-0"
                />
              ),
              open: templateOpen,
              onOpenChange: (next, away) => {
                setTemplateOpen(next);
                // Closed without a choice: back to the text, not to a button
                // that is not there. A manage item's dialog keeps the keyboard.
                if (!next && !away) setTimeout(() => focusText(editor), 0);
              },
              // Picked or not, never to the anchor: it is hidden, and Radix
              // would send the keyboard there as the menu unmounts.
              onCloseAutoFocus: (event, _picked, away) => {
                event.preventDefault();
                if (!away) focusText(editor);
              },
            }
          : {
              trigger: (
                <Trigger label="Insert a template" className={TEXT_BTN}>
                  <FileText {...ICON} />
                  Template
                </Trigger>
              ),
              // A pick leaves the keyboard in the text, as the other menus do;
              // Escape still returns to the button.
              onCloseAutoFocus: (event, picked) => {
                if (!picked) return;
                event.preventDefault();
                focusText(editor);
              },
            },
      )
    : null;
  const dictate = onDictate ? (
    <Tool
      label="Dictate. Your browser's speech service turns speech into text."
      pressed={dictating ? true : undefined}
      onClick={onDictate}
    >
      <Microphone {...ICON} />
    </Tool>
  ) : null;
  const versions = onHistory ? (
    <Tool label="Version history" onClick={(e) => onHistory(e.currentTarget)}>
      <ClockCounterClockwise {...ICON} />
    </Tool>
  ) : null;
  const fullScreenLabel = fullScreen ? 'Exit full screen' : 'Full screen';
  const fullScreenButton = onFullScreen ? (
    <Tool label={fullScreenLabel} onClick={onFullScreen}>
      {fullScreen ? <ArrowsIn {...ICON} /> : <ArrowsOut {...ICON} />}
    </Tool>
  ) : null;

  // What a phone moves out of the bar: each menu a sub-menu, then the host's tools.
  const more: Entry[] = [
    {
      kind: 'sub',
      id: 'font',
      label: 'Font',
      value: familyName,
      entries: fontEntries(s),
    },
    {
      kind: 'sub',
      id: 'size',
      label: 'Size',
      value: String(s.size),
      entries: sizeEntries(s),
    },
    { kind: 'sub', id: 'format', label: 'Format', entries: formatEntries(s) },
    {
      kind: 'sub',
      id: 'colour',
      label: 'Text colour',
      value: colourName,
      entries: colourEntries(s),
    },
    {
      kind: 'sub',
      id: 'highlight',
      label: 'Highlight',
      value: highlightName,
      entries: highlightEntries(s),
    },
    {
      kind: 'sub',
      id: 'paragraph',
      label: 'Paragraph',
      value: alignName,
      entries: paragraphEntries(s),
    },
  ];
  if (templateSlot || onDictate || onHistory || onFullScreen)
    more.push({ kind: 'sep' });
  if (templateSlot)
    more.push({
      kind: 'action',
      id: 'template',
      label: 'Template',
      run: call(() => setTemplateOpen(true)),
    });
  if (onDictate)
    more.push({
      kind: 'action',
      id: 'dictate',
      label: dictating ? 'Stop dictating' : 'Dictate',
      // U4: where the control has no tooltip (a phone), the item says who listens.
      description: "Your browser's speech service turns speech into text.",
      run: call(onDictate),
    });
  if (onHistory)
    more.push({
      kind: 'action',
      id: 'history',
      label: 'Version history',
      run: call(() => onHistory(moreButton)),
    });
  if (onFullScreen)
    more.push({
      kind: 'action',
      id: 'full',
      label: fullScreenLabel,
      run: call(onFullScreen),
    });

  const ROW =
    'flex flex-[1_1_auto] flex-wrap items-center gap-0.5 max-sm:basis-full';

  return (
    <div
      className={`flex flex-col items-start gap-2${sticky ? ' sticky top-0 z-10 bg-surface-1 pt-3 pb-1' : ''}`}
    >
      <Toolbar.Root
        aria-label="Formatting"
        className="flex w-full max-w-full flex-wrap items-center gap-y-1 self-stretch rounded-[10px] bg-sunken p-1"
      >
        {phone ? (
          <>
            {/* At 44px a button, the comp's row of bold, italic and underline beside the style does not fit 390px: the style and More share the first row, the marks, link and insert the second. */}
            <div className={ROW}>
              {history}
              {style}
              {menu(
                'More tools',
                more,
                <Trigger
                  ref={setMoreButton}
                  label="More tools"
                  className={`${TEXT_BTN} ml-auto`}
                >
                  <DotsThree size={16} weight="bold" aria-hidden="true" />
                  More
                </Trigger>,
                { title: 'More tools', align: 'end' },
              )}
              {template}
            </div>
            <div className={ROW}>
              {marks}
              {link}
              {insert}
            </div>
          </>
        ) : (
          <>
            <div className={ROW}>
              {history}
              <Sep />
              {style}
              {menu(
                'Font',
                fontEntries(s),
                <Trigger label={`Font: ${familyName}`}>
                  {familyName}
                  <Caret />
                </Trigger>,
                { narrow: true },
              )}
              {menu(
                'Size',
                sizeEntries(s),
                <Trigger label={`Size: ${s.size}`}>
                  {s.size}
                  <Caret />
                </Trigger>,
                { narrow: true },
              )}
              <Sep />
              {marks}
              {link}
              {menu(
                'Format',
                formatEntries(s),
                <Trigger label="Format: strikethrough, inline code, superscript, subscript, clear formatting">
                  Format
                  <Caret />
                </Trigger>,
              )}
            </div>
            <div className={ROW}>
              {menu(
                'Text colour',
                colourEntries(s),
                <Trigger
                  label="Text colour"
                  title={`Text colour: ${colourName}`}
                  className={BTN}
                >
                  <TextAUnderline {...ICON} />
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-[3px] h-[2.5px] rounded-sm"
                    style={{ background: s.colour ?? 'var(--text)' }}
                  />
                </Trigger>,
              )}
              {menu(
                'Highlight',
                highlightEntries(s),
                <Trigger
                  label="Highlight"
                  title={`Highlight: ${highlightName}`}
                  className={BTN}
                >
                  <Highlighter {...ICON} />
                </Trigger>,
              )}
              <Sep />
              {menu(
                'Paragraph',
                paragraphEntries(s),
                <Trigger
                  label="Paragraph: alignment and indent"
                  className={BTN}
                >
                  <AlignIcon {...ICON} />
                  <Caret />
                </Trigger>,
              )}
              <Sep />
              {insert}
              {template}
              {dictate}
              {versions || fullScreenButton ? (
                <span className="ml-auto flex items-center gap-0.5">
                  {versions}
                  {fullScreenButton}
                </span>
              ) : null}
            </div>
          </>
        )}
      </Toolbar.Root>
      {linkOpen ? (
        <form
          onSubmit={applyLink}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Taken: it closes this form and nothing around it (full screen).
              e.preventDefault();
              setLinkOpen(false);
              editor.commands.focus();
            }
          }}
          className="flex w-full max-w-[420px] items-center gap-2"
        >
          <input
            autoFocus
            type="text"
            inputMode="url"
            aria-label="Link address"
            placeholder="Paste or type an address"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-[9px] border border-line-2 bg-surface-1 px-3 text-[13.5px] text-text placeholder:text-faint"
          />
          <button
            type="submit"
            className="h-9 rounded-[9px] bg-accent px-3 text-[13px] font-medium text-accent-fg hover:bg-accent-hover"
          >
            {href.trim() ? 'Apply' : 'Remove link'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
