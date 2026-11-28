// A YouTube video, embedded (spec §5.6, B42, U4): Tiptap's node, set to the
// privacy-enhanced domain and drawn by Keel's view, which plays it only while
// the note is open and the browser is online and falls back to the plain link.
// The paste rule is off: a pasted address is offered an embed, never made one.
import { Youtube } from '@tiptap/extension-youtube';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { YoutubeView } from '../embed-view';
import { youtubeEmbedSrc } from './embed-urls';

export const KeelYoutube = Youtube.extend({
  addNodeView() {
    return ReactNodeViewRenderer(YoutubeView);
  },

  // Whatever address a body holds, its html plays from the no-cookie domain.
  renderHTML({ HTMLAttributes }) {
    const src = youtubeEmbedSrc(
      HTMLAttributes.src,
      Number(HTMLAttributes.start) || 0,
    );
    return [
      'div',
      { 'data-youtube-video': '' },
      [
        'iframe',
        {
          src: src ?? '',
          width: 640,
          height: 360,
          allowfullscreen: 'true',
          referrerpolicy: 'strict-origin-when-cross-origin',
        },
      ],
    ];
  },
}).configure({
  nocookie: true,
  addPasteHandler: false,
  inline: false,
  rel: 0,
  width: 640,
  height: 360,
});
