import { expect, test } from 'vitest';
import { docExcerpt, docText } from './note-text';

const doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Plan' }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Wait for the open' }],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Size down' }],
            },
          ],
        },
      ],
    },
  ],
};

test('docText joins blocks with a newline', () => {
  expect(docText(doc)).toBe('Plan\nWait for the open\nSize down');
});

test('docExcerpt flattens whitespace, ends each block like a sentence so a heading never runs into its body, and trims to max with an ellipsis', () => {
  expect(docExcerpt(doc, 10)).toBe('Plan. Wai…');
  expect(docExcerpt(doc, 200)).toBe('Plan. Wait for the open. Size down.');
});

test('inline marks, hard breaks and empty blocks are handled', () => {
  const d = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a', marks: [{ type: 'bold' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'b' },
        ],
      },
      { type: 'paragraph' },
    ],
  };
  expect(docText(d)).toBe('a\nb');
});

test('junk input gives an empty string', () => {
  expect(docText(null)).toBe('');
  expect(docText('x')).toBe('');
  expect(docExcerpt(undefined, 5)).toBe('');
});
