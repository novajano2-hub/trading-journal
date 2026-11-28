// Test-only: a paste event that carries files, for an editor under happy-dom
// (which has no real clipboard). `text` is what the clipboard holds as plain
// text beside them.
import { act } from '@testing-library/react';

export function pasteFiles(
  target: HTMLElement,
  files: File[],
  text = '',
): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files,
      types: [
        ...(files.length ? ['Files'] : []),
        ...(text ? ['text/plain'] : []),
      ],
      items: files.map((f) => ({
        kind: 'file',
        type: f.type,
        getAsFile: () => f,
      })),
      getData: (type: string) =>
        type === 'text/plain' || type === 'Text' ? text : '',
    },
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}
