// A post from X, embedded (spec §5.6, B42, owner's decision U4). The node
// stores the post's address and nothing else. Whether anything is fetched is
// the view's business (`embed-view.tsx`): X's widget script loads only when the
// node mounts and the browser is online, and the plain link is what shows
// offline, while it loads, and if it fails.
import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { TweetView } from '../embed-view';
import { parseTweetUrl } from './embed-urls';

export const Tweet = Node.create({
  name: 'tweet',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { url: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-keel-tweet]',
        getAttrs: (el) => {
          const post = parseTweetUrl(el.getAttribute('data-url') ?? '');
          return post ? { url: post.url } : false;
        },
      },
    ];
  },
  renderHTML({ node }) {
    // A body can come from a file (an imported note): whatever address it holds,
    // only an X post is written out as a link; anything else is written as nothing.
    const url = parseTweetUrl(String(node.attrs.url ?? ''))?.url ?? '';
    return [
      'div',
      { 'data-keel-tweet': '', 'data-url': url },
      ['a', url === '' ? {} : { href: url }, url],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TweetView);
  },
});
