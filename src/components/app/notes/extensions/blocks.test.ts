// @vitest-environment happy-dom
// The blocks Task 20 part B adds to the editor, on a real editor and no React:
// columns, a page break, equations, a timed list, link chips, embeds and the
// moving of a block.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { Editor } from '@tiptap/core';
import { getSchema } from '@tiptap/core';
import { noteExtensions } from './index';
import type { BlockBridge } from './blocks-model';
import { parseEmbedUrl, parseTweetUrl, youtubeEmbedSrc } from './embed-urls';

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
};
const para = (text?: string): Node => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});
const docOf = (...content: Node[]) => ({ type: 'doc', content });

function make(
  content: unknown,
  at = 1,
  host: Partial<BlockBridge> = {},
  to = at,
): Editor {
  const editor = new Editor({
    extensions: noteExtensions(undefined, {}, host),
    content: content as never,
  });
  editors.push(editor);
  editor.commands.setTextSelection({ from: at, to });
  return editor;
}
const blocks = (e: Editor) => (e.getJSON() as Node).content ?? [];
const kinds = (e: Editor) => blocks(e).map((b) => b.type);
const textOf = (n: Node | undefined): string =>
  n === undefined ? '' : (n.text ?? (n.content ?? []).map(textOf).join(''));

/** A key through the editor's own keymap, as a keyboard sends it. */
function press(
  editor: Editor,
  key: string,
  mods: Partial<KeyboardEventInit> = {},
) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...mods,
  });
  return (
    editor.view.someProp('handleKeyDown', (f) => f(editor.view, event)) === true
  );
}

// ---- columns ----------------------------------------------------------------

test('columns hold two or three', () => {
  const schema = getSchema(noteExtensions());
  const column = { type: 'column', content: [para('Working')] };
  const columns = (n: number) =>
    schema.nodeFromJSON({
      type: 'columns',
      content: Array.from({ length: n }, () => column),
    });
  expect(() => columns(2).check()).not.toThrow();
  expect(() => columns(3).check()).not.toThrow();
  // One column is not a layout, and four are more than the page holds.
  expect(() => columns(1).check()).toThrow();
  expect(() => columns(4).check()).toThrow();

  const two = make(docOf(para('Plan')), 5);
  expect(two.commands.insertColumns(2)).toBe(true);
  const layout = blocks(two).find((b) => b.type === 'columns')!;
  expect(layout.content).toHaveLength(2);
  expect(layout.content!.every((c) => c.type === 'column')).toBe(true);
  // Each column starts with a paragraph to type in.
  expect(
    layout.content!.every((c) => c.content?.[0]?.type === 'paragraph'),
  ).toBe(true);

  const three = make(docOf(para('Plan')), 5);
  expect(three.commands.insertColumns(3)).toBe(true);
  expect(blocks(three).find((b) => b.type === 'columns')!.content).toHaveLength(
    3,
  );

  // Neither a count nor a place the schema refuses.
  const four = make(docOf(para('Plan')), 5);
  expect(four.commands.insertColumns(4 as never)).toBe(false);
  expect(kinds(four)).toEqual(['paragraph']);
});

test('columns are written for the print layout and the saved html', () => {
  const e = make(docOf(para('Plan')), 5);
  e.commands.insertColumns(3);
  const html = e.getHTML();
  expect(html).toContain('data-type="columns"');
  expect((html.match(/data-type="column"/g) ?? []).length).toBe(3);
  // Read back from its own html.
  const again = make(html);
  expect(blocks(again).find((b) => b.type === 'columns')!.content).toHaveLength(
    3,
  );
});

test('a layout goes where the caret is, takes the caret, and is not nested in a column', () => {
  const e = make(docOf(para('One'), para('Two')), 3);
  e.commands.insertColumns(2);
  expect(kinds(e)).toEqual(['paragraph', 'columns', 'paragraph']);
  // The caret is in the first column, ready to type.
  const { $from } = e.state.selection;
  expect($from.node(-1).type.name).toBe('column');
  expect($from.index(-2)).toBe(0);
  // Inside a column there is no room for another layout.
  expect(e.can().insertColumns(2)).toBe(false);
  expect(e.commands.insertColumns(3)).toBe(false);
});

// ---- page break -------------------------------------------------------------

test('a page break is a dashed rule in the editor and breaks the page in the PDF', () => {
  const e = make(docOf(para('Plan'), para('')), 7);
  expect(e.commands.setPageBreak()).toBe(true);
  expect(kinds(e)).toContain('pageBreak');
  // Something follows it, so the caret has somewhere to go.
  expect(kinds(e).at(-1)).toBe('paragraph');
  const html = e.getHTML();
  expect(html).toContain('data-type="page-break"');
  expect(kinds(make(html))).toContain('pageBreak');
  // The rule the PDF reads, and the dashed one the editor draws.
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/app/notes/note-prose.css'),
    'utf8',
  );
  expect(css).toMatch(/page-break['\"]?\][^{]*\{[^}]*break-after:\s*page/);
  expect(css).toMatch(/page-break['\"]?\][^{]*\{[^}]*dashed/);
});

// ---- equations --------------------------------------------------------------

test('an equation renders and an invalid one falls back', () => {
  const e = make(
    docOf(
      para('Risk'),
      { type: 'blockMath', attrs: { latex: '\\frac{a}{b}' } },
      { type: 'blockMath', attrs: { latex: '\\frac{a' } },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'so ' },
          { type: 'inlineMath', attrs: { latex: 'x^2' } },
          { type: 'text', text: ' and ' },
          { type: 'inlineMath', attrs: { latex: '\\bad{' } },
        ],
      },
    ),
  );
  const dom = e.view.dom;
  const [good, bad] = [
    ...dom.querySelectorAll<HTMLElement>('[data-type="block-math"]'),
  ];
  // A formula is typeset by KaTeX.
  expect(good!.querySelector('.katex')).not.toBeNull();
  expect(good!.classList.contains('block-math-error')).toBe(false);
  // One that does not parse shows its own text, marked, and the rest still draws.
  expect(bad!.querySelector('.katex')).toBeNull();
  expect(bad!.textContent).toBe('\\frac{a');
  expect(bad!.classList.contains('block-math-error')).toBe(true);
  const inline = [
    ...dom.querySelectorAll<HTMLElement>('[data-type="inline-math"]'),
  ];
  expect(inline[0]!.querySelector('.katex')).not.toBeNull();
  expect(inline[1]!.textContent).toBe('\\bad{');
  expect(inline[1]!.classList.contains('inline-math-error')).toBe(true);
  // The body keeps the source in both cases.
  expect(JSON.stringify(e.getJSON())).toContain('\\\\frac{a');
});

// ---- timed list -------------------------------------------------------------

const clock = (initial: string) => {
  let now = initial;
  return {
    set: (v: string) => (now = v),
    host: { now: () => now } as Partial<BlockBridge>,
  };
};
const items = (e: Editor) =>
  (blocks(e).find((b) => b.type === 'timedList')?.content ?? []).map((i) => ({
    time: i.attrs?.time,
    text: textOf(i),
  }));

test('a timed list item starts with the time', () => {
  const c = clock('09:30');
  const e = make(docOf(para('Range set')), 10, c.host);
  expect(e.commands.toggleTimedList()).toBe(true);
  expect(items(e)).toEqual([{ time: '09:30', text: 'Range set' }]);
  // Enter at the end of an item starts the next with the time it is then.
  c.set('09:41');
  expect(press(e, 'Enter')).toBe(true);
  e.commands.insertContent('Long 2 on the break');
  c.set('09:52');
  expect(press(e, 'Enter')).toBe(true);
  e.commands.insertContent('Out at the target');
  expect(items(e)).toEqual([
    { time: '09:30', text: 'Range set' },
    { time: '09:41', text: 'Long 2 on the break' },
    { time: '09:52', text: 'Out at the target' },
  ]);
  // The time is saved with the item, and read back from its html.
  const html = e.getHTML();
  expect(html).toContain('data-time="09:41"');
  expect(items(make(html))).toEqual(items(e));
});

test('Enter in an empty timed item leaves the list, and a second Enter is not stamped again', () => {
  const c = clock('10:00');
  const e = make(docOf(para('Range set')), 10, c.host);
  e.commands.toggleTimedList();
  press(e, 'Enter');
  expect(items(e)).toHaveLength(2);
  // The empty item has its time; pressing Enter on it goes back to text.
  press(e, 'Enter');
  expect(items(e)).toEqual([{ time: '10:00', text: 'Range set' }]);
  // The caret is in text of its own below the list, not in an item.
  expect(kinds(e).slice(0, 2)).toEqual(['timedList', 'paragraph']);
  expect(e.state.selection.$from.node(-1).type.name).toBe('doc');
});

test('the toggle takes a timed list back to plain paragraphs', () => {
  const c = clock('09:30');
  const e = make(docOf(para('Range set')), 10, c.host);
  e.commands.toggleTimedList();
  expect(kinds(e)).toContain('timedList');
  e.commands.toggleTimedList();
  expect(kinds(e)).not.toContain('timedList');
  expect(textOf(blocks(e)[0])).toBe('Range set');
});

// ---- link chips -------------------------------------------------------------

test('link chips keep ids and nothing else', () => {
  const e = make(
    docOf({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Fills are in ' },
        { type: 'tradeLink', attrs: { tradeId: 't-1229' } },
        { type: 'text', text: ' and ' },
        { type: 'dayLink', attrs: { date: '2026-11-24' } },
      ],
    }),
  );
  const saved = JSON.stringify(e.getJSON());
  expect(saved).toContain('"tradeId":"t-1229"');
  expect(saved).toContain('"date":"2026-11-24"');
  // No money, no label: what a chip shows is read when it is drawn.
  expect(saved).not.toMatch(/\$|net|symbol/i);
  const html = e.getHTML();
  expect(html).toContain('data-trade-id="t-1229"');
  expect(html).toContain('data-day="2026-11-24"');
  expect(JSON.stringify(make(html).getJSON())).toContain('"tradeId":"t-1229"');
});

test('a day chip with a date that is not a date is not kept', () => {
  const e = make(
    '<p><span data-keel-day-link data-day="soon">x</span><span data-keel-day-link data-day="2026-11-24">y</span></p>',
  );
  const saved = JSON.stringify(e.getJSON());
  expect(saved).not.toContain('soon');
  expect(saved).toContain('2026-11-24');
});

// ---- embeds -----------------------------------------------------------------

test('a YouTube link is read for its video and always plays from the no-cookie domain', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ]) {
    const embed = parseEmbedUrl(url);
    expect(embed, url).toMatchObject({ kind: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(youtubeEmbedSrc(embed!.kind === 'youtube' ? embed!.src : '')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
  }
  const timed = parseEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=90');
  expect(timed).toMatchObject({ kind: 'youtube', start: 90 });
  expect(youtubeEmbedSrc((timed as { src: string }).src, 90)).toBe(
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90',
  );
  // Not a video: a channel, another host, a lookalike, a sentence.
  for (const text of [
    'https://www.youtube.com/@keel',
    'https://vimeo.com/123456789',
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://evil.test/?u=https://youtu.be/dQw4w9WgXcQ',
    'watch this https://youtu.be/dQw4w9WgXcQ',
    'javascript:alert(1)',
  ])
    expect(parseEmbedUrl(text), text).toBeNull();
});

test('an X post link is read for its post', () => {
  for (const url of [
    'https://x.com/keel/status/1860000000000000001',
    'https://twitter.com/keel/status/1860000000000000001?s=20',
    'https://www.x.com/keel/status/1860000000000000001',
    'https://mobile.twitter.com/keel/statuses/1860000000000000001',
  ])
    expect(parseTweetUrl(url), url).toEqual({
      id: '1860000000000000001',
      user: 'keel',
      url: 'https://x.com/keel/status/1860000000000000001',
    });
  for (const text of [
    'https://x.com/keel',
    'https://x.com.evil.test/keel/status/1860000000000000001',
    'https://example.com/keel/status/1860000000000000001',
    'https://x.com/keel/status/abc',
  ])
    expect(parseTweetUrl(text), text).toBeNull();
});

test('an embed is kept as its address, and only a real one', () => {
  const e = make(
    docOf(
      {
        type: 'youtube',
        attrs: { src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', start: 0 },
      },
      {
        type: 'tweet',
        attrs: { url: 'https://x.com/keel/status/1860000000000000001' },
      },
    ),
  );
  expect(kinds(e).slice(0, 2)).toEqual(['youtube', 'tweet']);
  const html = e.getHTML();
  expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  expect(html).not.toContain('www.youtube.com/embed');
  // Read back: the post from its html (the video's html holds a frame, which
  // happy-dom would try to load).
  expect(
    kinds(make(html.slice(html.indexOf('<div data-keel-tweet')))).at(0),
  ).toBe('tweet');
  // A tweet whose address is not an X post is dropped when it is read back.
  const bad = make(
    '<div data-keel-tweet data-url="https://evil.test/x"><a href="https://evil.test/x">x</a></div>',
  );
  expect(kinds(bad)).not.toContain('tweet');
});

test('a post whose stored address is not an X post writes no link (an imported file can carry any address)', () => {
  const html = (url: unknown) =>
    make(docOf({ type: 'tweet', attrs: { url } })).getHTML();
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'https://evil.test/keel/status/1860000000000000001',
    'https://x.com/keel',
    '',
    null,
  ]) {
    const out = html(url);
    expect(out, String(url)).not.toMatch(
      /href=|javascript:|evil\.test|<script/,
    );
  }
  // A real one keeps its link, and is normalised to x.com.
  const real = html('https://twitter.com/keel/status/1860000000000000001');
  expect(real).toContain(
    'href="https://x.com/keel/status/1860000000000000001"',
  );
});

// ---- moving a block ---------------------------------------------------------

test('Move up and Move down move a block', () => {
  const e = make(docOf(para('One'), para('Two'), para('Three')), 7); // in "Two"
  expect(e.commands.moveBlock('down')).toBe(true);
  expect(blocks(e).map(textOf)).toEqual(['One', 'Three', 'Two']);
  // The caret goes with it.
  expect(e.state.selection.$from.parent.textContent).toBe('Two');
  // At the end there is nowhere further.
  expect(e.can().moveBlock('down')).toBe(false);
  expect(e.commands.moveBlock('down')).toBe(false);
  expect(e.commands.moveBlock('up')).toBe(true);
  expect(e.commands.moveBlock('up')).toBe(true);
  expect(blocks(e).map(textOf)).toEqual(['Two', 'One', 'Three']);
  expect(e.can().moveBlock('up')).toBe(false);
});

test('a block is moved by its place, as the handle does, wherever the caret is', () => {
  const e = make(docOf(para('One'), para('Two'), para('Three')), 2);
  // "Three" starts at 12; move it up by its position.
  expect(e.commands.moveBlock('up', 10)).toBe(true);
  expect(blocks(e).map(textOf)).toEqual(['One', 'Three', 'Two']);
  // The caret stayed in "One".
  expect(e.state.selection.$from.parent.textContent).toBe('One');
});

test('the keyboard moves a block with Mod-Shift-Arrow', () => {
  const e = make(docOf(para('One'), para('Two')), 2);
  expect(press(e, 'ArrowDown', { ctrlKey: true, shiftKey: true })).toBe(true);
  expect(blocks(e).map(textOf)).toEqual(['Two', 'One']);
  expect(press(e, 'ArrowUp', { ctrlKey: true, shiftKey: true })).toBe(true);
  expect(blocks(e).map(textOf)).toEqual(['One', 'Two']);
});

test('a block in a column moves within the column, not out of the layout', () => {
  const column = (...t: string[]) => ({
    type: 'column',
    content: t.map((x) => para(x)),
  });
  const e = make(
    docOf({
      type: 'columns',
      content: [column('A', 'B'), column('C')],
    }),
    3, // in "A"
  );
  expect(e.commands.moveBlock('down')).toBe(true);
  const layout = blocks(e)[0]!;
  expect(layout.content![0]!.content!.map(textOf)).toEqual(['B', 'A']);
  expect(layout.content![1]!.content!.map(textOf)).toEqual(['C']);
  // At the end of the column, down does not leave it.
  expect(e.can().moveBlock('down')).toBe(false);
});
