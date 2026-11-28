'use client';

// A timed list item (spec §5.6, B34): the time in a small box beside the item,
// then the item's own blocks. The time is an attribute of the item, kept as
// "HH:MM"; the box takes "9:41", "941" or "09:41", and a value that is not a
// time of day goes back to what it was. A note that cannot be edited shows the
// time as text.
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from '@tiptap/react';
import { useState } from 'react';
import { normalTime } from './extensions/blocks-model';

export function TimedItemView({
  node,
  editor,
  updateAttributes,
}: NodeViewProps): React.JSX.Element {
  const time = String(node.attrs.time ?? '');
  const editable = useEditorState({
    editor,
    selector: ({ editor: e }) => e.isEditable,
  });
  // The box follows the item when it changes from outside (undo, a restore).
  const [draft, setDraft] = useState(time);
  const [seen, setSeen] = useState(time);
  if (seen !== time) {
    setSeen(time);
    setDraft(time);
  }

  const commit = () => {
    const next = normalTime(draft);
    if (next === null) {
      setDraft(time);
      return;
    }
    setDraft(next);
    if (next !== time) updateAttributes({ time: next });
  };

  return (
    <NodeViewWrapper
      as="li"
      data-type="timed-item"
      data-time={time}
      className="note-timed-item"
    >
      <span className="note-timed-stamp" contentEditable={false}>
        {editable ? (
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            size={5}
            aria-label="Time"
            value={draft}
            className="note-timed-time"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
                editor.commands.focus();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(time);
                editor.commands.focus();
              }
            }}
          />
        ) : (
          <time className="note-timed-time">{time}</time>
        )}
      </span>
      <NodeViewContent className="note-timed-body" />
    </NodeViewWrapper>
  );
}
