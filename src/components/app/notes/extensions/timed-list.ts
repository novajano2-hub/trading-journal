// A timed list (spec §5.6, B34): a list whose every item starts with a time.
// A new item takes the time it is made (the host says it, in the profile's
// time zone) and the person can change it in the box beside the item. The time
// is kept as an attribute of the item as "HH:MM", never as text of the body.
import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TimedItemView } from '../timed-view';
import { normalTime, type BlockBridge } from './blocks-model';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    keelTimedList: {
      /** Makes the block a timed list, each item stamped with the time now; in a timed list, takes it back to blocks. */
      toggleTimedList: () => ReturnType;
    };
  }
}

interface Options {
  /** A getter, because Tiptap copies a plain object given as an option. */
  bridge: () => Pick<BlockBridge, 'now'>;
}

export const TimedItem = Node.create<Options>({
  name: 'timedItem',
  content: 'paragraph block*',
  defining: true,

  addOptions() {
    return { bridge: () => ({ now: () => '' }) };
  },

  addAttributes() {
    return {
      time: {
        default: '',
        parseHTML: (el: HTMLElement) =>
          normalTime(el.getAttribute('data-time') ?? '') ?? '',
        renderHTML: (attrs: Record<string, unknown>) => ({
          'data-time': String(attrs.time ?? ''),
        }),
      },
    };
  },

  parseHTML() {
    // Above the plain list item's `li`, which would otherwise take it.
    return [
      {
        tag: 'li[data-type="timed-item"]',
        contentElement: 'div',
        priority: 100,
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'li',
      mergeAttributes(HTMLAttributes, { 'data-type': 'timed-item' }),
      ['time', {}, String(node.attrs.time ?? '')],
      ['div', {}, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TimedItemView);
  },

  addKeyboardShortcuts() {
    return {
      // The next item starts with the time it is then.
      Enter: () =>
        this.editor.commands.splitListItem(this.name, {
          time: this.options.bridge().now(),
        }),
    };
  },
});

export const TimedList = Node.create<Options>({
  name: 'timedList',
  // `list`: the editor's own list commands (toggle, lift) take this as a list.
  group: 'block list',
  content: 'timedItem+',

  addOptions() {
    return { bridge: () => ({ now: () => '' }) };
  },

  parseHTML() {
    return [{ tag: 'ul[data-type="timed-list"]', priority: 100 }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'ul',
      mergeAttributes(HTMLAttributes, { 'data-type': 'timed-list' }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleTimedList:
        () =>
        ({ chain, editor }) => {
          if (!editor.isEditable) return false;
          const now = this.options.bridge().now();
          return chain()
            .toggleList(this.name, 'timedItem')
            .command(({ tr }) => {
              // The items the list has just made have no time yet.
              tr.doc.descendants((node, pos) => {
                if (node.type.name === 'timedItem' && !node.attrs.time)
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    time: now,
                  });
              });
              return true;
            })
            .run();
        },
    };
  },
});
