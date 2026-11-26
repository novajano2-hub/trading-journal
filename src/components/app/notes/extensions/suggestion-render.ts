// The part of a suggestion menu that is not its look: what Tiptap's suggestion
// plugin tells a menu (the items, where the caret is, how to choose one) and
// the keys it owns while the menu is open. The slash menu and the emoji menu
// share it; each draws its own list.
import type { SuggestionOptions } from '@tiptap/suggestion';

export interface MenuState<T> {
  items: T[];
  index: number;
  rect: DOMRect | null;
  pick: (item: T) => void;
}

export interface MenuBridge<T> {
  set: (state: MenuState<T> | null) => void;
  /** The current state, read by the key handler. */
  get: () => MenuState<T> | null;
}

/**
 * The plugin's `render` for a menu drawn from `bridge`. With no bridge (an
 * editor with no menu to draw) the trigger does nothing and keeps no keys.
 */
export function suggestionRender<T>(
  bridge: () => MenuBridge<T> | undefined,
): NonNullable<SuggestionOptions<T, T>['render']> {
  return () => {
    let index = 0;
    const push = (p: {
      items: T[];
      clientRect?: (() => DOMRect | null) | null;
      command: (item: T) => void;
    }) => {
      index = Math.min(index, Math.max(0, p.items.length - 1));
      bridge()?.set({
        items: p.items,
        index,
        rect: p.clientRect?.() ?? null,
        pick: p.command,
      });
    };
    return {
      onStart: (p) => {
        index = 0;
        push(p);
      },
      onUpdate: (p) => {
        index = 0;
        push(p);
      },
      onKeyDown: ({ event }) => {
        const b = bridge();
        const s = b?.get();
        if (!b || !s) return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          const n = s.items.length;
          if (n === 0) return true;
          index = (index + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
          b.set({ ...s, index });
          return true;
        }
        if (event.key === 'Enter') {
          const item = s.items[index];
          if (item) s.pick(item);
          return true;
        }
        if (event.key === 'Escape') {
          b.set(null);
          return false; // lets the plugin close itself
        }
        return false;
      },
      onExit: () => bridge()?.set(null),
    };
  };
}
