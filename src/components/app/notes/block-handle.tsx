'use client';

// The handles beside a block (spec §5.6, B54, comp 05): hovering a block shows
// a "+" that opens the slash menu there and a grip that drags the block. The
// grip is also a button with a menu (Move up, Move down, Delete block) for
// anyone who cannot drag; Mod-Shift-Up and Down and the paragraph menu are the
// keyboard's way (a phone has no hover, so no handles). Tiptap's drag handle
// does the positioning and the dragging.
import { DotsSixVertical, Plus } from '@phosphor-icons/react/dist/ssr';
import type { Editor } from '@tiptap/core';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { DropdownMenu } from 'radix-ui';
import { useRef, useState } from 'react';
import { ariaKeys, keyLabel } from './editor-toolbar';
import { blockHoverKey } from './extensions/block-hover';
import { blockPosOf } from './extensions/blocks';

const ICON = { size: 15, 'aria-hidden': true } as const;

// Module-level on purpose: the drag handle registers its plugin again whenever
// this object changes, and that resets every open suggestion menu.
const PLACEMENT = { placement: 'left-start', strategy: 'absolute' } as const;

const HANDLE_BUTTON =
  'inline-grid h-[22px] w-[18px] place-items-center rounded-[5px] text-faint hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent aria-expanded:bg-sunken aria-expanded:text-text';
const MENU =
  'z-[60] min-w-[200px] overflow-y-auto rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const ITEM =
  'relative flex min-h-9 cursor-pointer items-center justify-between gap-6 rounded-[8px] px-2.5 text-[13.5px] text-text outline-none select-none data-[disabled]:cursor-default data-[disabled]:text-faint data-[highlighted]:bg-sunken';

/** Whether the block at `pos` has a neighbour above and below it. */
function roomAround(editor: Editor, pos: number) {
  const $pos = editor.state.doc.resolve(pos);
  return {
    up: $pos.index() > 0,
    down: $pos.index() < $pos.parent.childCount - 1,
  };
}

export function BlockHandle({ editor }: { editor: Editor }): React.JSX.Element {
  // The block the pointer is over, by position; -1 when none.
  const hovered = useRef(-1);
  const [menu, setMenu] = useState<{
    pos: number;
    up: boolean;
    down: boolean;
  } | null>(null);

  const setHovered = (pos: number) => {
    hovered.current = pos;
    if (editor.isDestroyed) return;
    editor.view.dispatch(
      editor.state.tr.setMeta(blockHoverKey, pos >= 0 ? pos : null),
    );
  };
  /** The block the handle is for: the hovered one, else the one the caret is in. */
  const target = (): number | null => {
    const pos =
      hovered.current >= 0 ? hovered.current : blockPosOf(editor.state);
    return pos !== null && editor.state.doc.nodeAt(pos) ? pos : null;
  };
  // While the menu is open the handle stays where it is.
  const lock = (locked: boolean) => {
    if (!editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta('lockDragHandle', locked));
  };

  const add = () => {
    const pos = target();
    const node = pos === null ? null : editor.state.doc.nodeAt(pos);
    if (pos === null || !node) return;
    const empty = node.type.name === 'paragraph' && node.content.size === 0;
    const chain = editor.chain().focus();
    // The slash menu opens on the "/" typed in a paragraph of its own.
    if (empty)
      chain
        .setTextSelection(pos + 1)
        .insertContent('/')
        .run();
    else
      chain
        .insertContentAt(pos + node.nodeSize, {
          type: 'paragraph',
          content: [{ type: 'text', text: '/' }],
        })
        .run();
  };

  const openMenu = () => {
    const pos = target();
    if (pos === null) return;
    lock(true);
    setMenu({ pos, ...roomAround(editor, pos) });
  };
  const closeMenu = () => {
    lock(false);
    setMenu(null);
  };

  return (
    <DragHandle
      editor={editor}
      className="note-block-handle"
      onNodeChange={({ pos }) => setHovered(pos)}
      computePositionConfig={PLACEMENT}
    >
      <div className="note-block-handle-inner">
        <button
          type="button"
          aria-label="Add a block below"
          title="Add a block below"
          onClick={add}
          className={HANDLE_BUTTON}
        >
          <Plus {...ICON} />
        </button>
        <DropdownMenu.Root
          open={menu !== null}
          onOpenChange={(open) => (open ? openMenu() : closeMenu())}
        >
          {/* The menu hangs from this, which takes no press of its own: the grip
              is a drag handle, and a press on a Radix trigger would end the drag
              before it began. The grip opens the menu on its click. */}
          <span className="relative inline-grid">
            <DropdownMenu.Trigger asChild>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
              />
            </DropdownMenu.Trigger>
            <button
              type="button"
              aria-label="Move this block"
              aria-haspopup="menu"
              aria-expanded={menu !== null}
              title="Drag to move this block, or click for more"
              onClick={openMenu}
              className={`${HANDLE_BUTTON} cursor-grab active:cursor-grabbing`}
            >
              <DotsSixVertical {...ICON} />
            </button>
          </span>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              side="bottom"
              sideOffset={6}
              className={MENU}
              aria-label="Block"
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                if (!editor.isDestroyed) editor.commands.focus();
              }}
            >
              <DropdownMenu.Item
                className={ITEM}
                aria-keyshortcuts={ariaKeys('Mod-Shift-ArrowUp')}
                disabled={menu ? !menu.up : true}
                onSelect={() =>
                  menu && editor.chain().focus().moveBlock('up', menu.pos).run()
                }
              >
                Move up
                <kbd
                  aria-hidden="true"
                  className="font-sans text-[12px] text-faint"
                >
                  {keyLabel('Mod-Shift-ArrowUp')}
                </kbd>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={ITEM}
                aria-keyshortcuts={ariaKeys('Mod-Shift-ArrowDown')}
                disabled={menu ? !menu.down : true}
                onSelect={() =>
                  menu &&
                  editor.chain().focus().moveBlock('down', menu.pos).run()
                }
              >
                Move down
                <kbd
                  aria-hidden="true"
                  className="font-sans text-[12px] text-faint"
                >
                  {keyLabel('Mod-Shift-ArrowDown')}
                </kbd>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                className={ITEM}
                onSelect={() =>
                  menu && editor.chain().focus().deleteBlock(menu.pos).run()
                }
              >
                Delete block
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </DragHandle>
  );
}
