'use client';

// The ":" menu of the note editor (spec §5.6, B34): a listbox of the emoji a
// query finds, driven by the same suggestion plugin as the slash menu. The
// plugin owns the trigger and the keys (`extensions/suggestion-render`); this
// file draws the list.
import { useEffect, useRef } from 'react';
import { emojiLabel, type EmojiItem } from './extensions/emoji';
import type { MenuBridge, MenuState } from './extensions/suggestion-render';
import { placeMenu } from './menu-position';

export type EmojiState = MenuState<EmojiItem>;
export type EmojiBridge = MenuBridge<EmojiItem>;

export const EMOJI_LISTBOX_ID = 'note-emoji-listbox';
export const emojiOptionId = (i: number) => `note-emoji-option-${i}`;

export function EmojiMenu({ state }: { state: EmojiState }) {
  const activeRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [state.index]);
  const { style } = placeMenu(state.rect, 260, 8 * 40 + 40);

  return (
    <div
      style={style}
      className="z-50 w-[260px] max-w-[calc(100vw-16px)] rounded-[12px] border border-line bg-surface-1 p-1 shadow-[var(--shadow)]"
    >
      {state.items.length === 0 ? (
        <p className="px-3 py-2 text-[13px] text-faint">No emoji match.</p>
      ) : (
        <ul role="listbox" id={EMOJI_LISTBOX_ID} aria-label="Emoji">
          {state.items.map((item, i) => (
            <li
              key={item.name}
              ref={i === state.index ? activeRef : undefined}
              id={emojiOptionId(i)}
              role="option"
              aria-selected={i === state.index}
              aria-label={`${item.emoji} ${emojiLabel(item)}`}
              // Keep the editor's selection: mousedown must not blur it.
              onMouseDown={(e) => {
                e.preventDefault();
                state.pick(item);
              }}
              className={`flex cursor-pointer items-center gap-3 rounded-[8px] px-3 py-1.5 pointer-coarse:min-h-11 ${
                i === state.index ? 'bg-sunken' : ''
              }`}
            >
              <span
                aria-hidden="true"
                className="w-6 text-center text-[18px] leading-none"
              >
                {item.emoji}
              </span>
              <span className="truncate text-[13.5px] text-text">
                :{emojiLabel(item)}:
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 border-t border-line px-3 pt-1.5 pb-1 text-[12px] text-faint">
        Keep typing to search.
      </p>
    </div>
  );
}
