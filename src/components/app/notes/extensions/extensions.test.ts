// @vitest-environment happy-dom
import { afterEach, expect, test } from 'vitest';
import { Editor, getSchema } from '@tiptap/core';
import {
  DOMParser as PMParser,
  DOMSerializer,
  type Node as PMNode,
} from '@tiptap/pm/model';
import { INDENT_MAX, INDENT_STEP } from './indent';
import { noteExtensions } from './index';

const editors: Editor[] = [];
afterEach(() => {
  for (const e of editors.splice(0)) e.destroy();
});

const para = (text?: string) => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});
const docOf = (...content: unknown[]) => ({ type: 'doc', content });

function make(content: unknown, from = 1, to = from): Editor {
  const editor = new Editor({
    extensions: noteExtensions(),
    content: content as never,
  });
  editors.push(editor);
  editor.commands.setTextSelection({ from, to });
  return editor;
}

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
};
const blocks = (e: Editor) => (e.getJSON() as Node).content ?? [];
const textOf = (n: Node | undefined): string =>
  n === undefined ? '' : (n.text ?? (n.content ?? []).map(textOf).join(''));

test('a paragraph indents in steps of 24px up to 8 steps, and outdents back', () => {
  expect(INDENT_STEP).toBe(24);
  expect(INDENT_MAX).toBe(8);
  const e = make(docOf(para('Held the plan')), 3);
  expect(e.can().outdent()).toBe(false);
  for (let i = 1; i <= INDENT_MAX; i++) {
    expect(e.commands.indent()).toBe(true);
    expect(blocks(e)[0]?.attrs?.indent).toBe(i);
  }
  expect(e.getHTML()).toContain(`margin-inline-start: ${8 * INDENT_STEP}px`);
  expect(e.can().indent()).toBe(false);
  expect(e.commands.indent()).toBe(false);
  expect(e.commands.outdent()).toBe(true);
  expect(blocks(e)[0]?.attrs?.indent).toBe(7);
  for (let i = 0; i < 7; i++) e.commands.outdent();
  expect(blocks(e)[0]?.attrs?.indent).toBe(0);
  expect(e.getHTML()).not.toContain('margin-inline-start');
});

test('indent reads back from saved html and applies to every block in the selection', () => {
  const e = make(docOf(para('One'), para('Two'), para('Three')), 2, 12);
  e.commands.indent();
  expect(blocks(e).map((b) => b.attrs?.indent)).toEqual([1, 1, 1]);
  const again = make(e.getHTML());
  expect(blocks(again).map((b) => b.attrs?.indent)).toEqual([1, 1, 1]);
});

test('in a list, indent sinks the item and outdent lifts it', () => {
  const item = (t: string) => ({
    type: 'listItem',
    content: [para(t)],
  });
  const e = make(
    docOf({ type: 'bulletList', content: [item('One'), item('Two')] }),
    11,
  );
  expect(e.commands.indent()).toBe(true);
  const list = blocks(e)[0]!;
  expect(list.content).toHaveLength(1);
  expect(list.content![0]!.content!.some((n) => n.type === 'bulletList')).toBe(
    true,
  );
  expect(e.commands.outdent()).toBe(true);
  expect(blocks(e)[0]!.content).toHaveLength(2);
});

test('a toggle takes the block as its title and opens with an empty body', () => {
  const e = make(docOf(para('Held the plan')), 3);
  expect(e.commands.setToggle(0)).toBe(true);
  const details = blocks(e)[0]!;
  expect(details.type).toBe('details');
  expect(details.attrs?.toggle).toBe(0);
  expect(details.attrs?.open).toBe(true);
  expect(details.content?.map((n) => n.type)).toEqual([
    'detailsSummary',
    'detailsContent',
  ]);
  expect(textOf(details.content![0])).toBe('Held the plan');
  expect(details.content![1]!.content).toEqual([
    { type: 'paragraph', attrs: expect.anything() },
  ]);
});

test('a toggle heading keeps its level, switches level, and turns back into the block', () => {
  const e = make(docOf(para('Held the plan')), 3);
  expect(e.commands.setToggle(2)).toBe(true);
  expect(blocks(e)[0]?.attrs?.toggle).toBe(2);
  expect(e.getHTML()).toContain('data-toggle="2"');
  // In its title, another level switches it in place.
  expect(e.commands.setToggle(3)).toBe(true);
  expect(blocks(e)).toHaveLength(2); // the details and the trailing paragraph
  expect(blocks(e)[0]?.attrs?.toggle).toBe(3);
  // The same level again turns it back into a paragraph.
  expect(e.commands.setToggle(3)).toBe(true);
  expect(blocks(e)[0]?.type).toBe('paragraph');
  expect(textOf(blocks(e)[0])).toBe('Held the plan');
});

test('a heading becomes a toggle heading with its text as the title', () => {
  const e = make(
    docOf({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Plan' }],
    }),
    2,
  );
  expect(e.commands.setToggle(1)).toBe(true);
  expect(blocks(e)[0]?.type).toBe('details');
  expect(textOf(blocks(e)[0]!.content![0])).toBe('Plan');
});

test('several blocks fold under a new, empty title', () => {
  const e = make(docOf(para('One'), para('Two')), 2, 8);
  expect(e.commands.setToggle(1)).toBe(true);
  const details = blocks(e)[0]!;
  expect(details.type).toBe('details');
  expect(details.attrs?.toggle).toBe(1);
  expect(textOf(details.content![0])).toBe('');
  expect(details.content![1]!.content!.map(textOf)).toEqual(['One', 'Two']);
});

test('an existing collapsible section keeps its look: no toggle value', () => {
  const e = make(docOf(para('Notes')), 2);
  e.commands.setDetails();
  const details = blocks(e)[0]!;
  expect(details.type).toBe('details');
  expect(details.attrs?.toggle ?? null).toBeNull();
  expect(e.getHTML()).not.toContain('data-toggle');
});

test('insert puts a toggle below a block with text, and takes over an empty one', () => {
  const full = make(docOf(para('Held the plan')), 3);
  expect(full.commands.insertToggle(1)).toBe(true);
  expect(blocks(full)[0]?.type).toBe('paragraph');
  expect(textOf(blocks(full)[0])).toBe('Held the plan');
  expect(blocks(full)[1]?.type).toBe('details');
  expect(blocks(full)[1]?.attrs?.toggle).toBe(1);
  expect(full.state.selection.$from.parent.type.name).toBe('detailsSummary');

  const empty = make(docOf(para()), 1);
  expect(empty.commands.insertToggle(0)).toBe(true);
  expect(blocks(empty)[0]?.type).toBe('details');
  expect(blocks(empty)[0]?.attrs?.toggle).toBe(0);
});

// ---- images ------------------------------------------------------------------

const schema = getSchema(noteExtensions());
const toHTML = (doc: unknown) => {
  const node = schema.nodeFromJSON(doc);
  const box = document.createElement('div');
  box.append(DOMSerializer.fromSchema(schema).serializeFragment(node.content));
  return box.innerHTML;
};
const fromHTML = (html: string): Node => {
  const box = document.createElement('div');
  box.innerHTML = html;
  return PMParser.fromSchema(schema).parse(box).toJSON() as Node;
};
const imageDoc = docOf({
  type: 'image',
  attrs: { src: 'keel-file:f-1', alt: 'Chart', width: 60, caption: 'ES 5m' },
});
const findAll = (n: Node, type: string): Node[] => [
  ...(n.type === type ? [n] : []),
  ...(n.content ?? []).flatMap((c) => findAll(c, type)),
];

test('an image is a figure holding the reference, the width and the caption', () => {
  expect(schema.nodes.image!.isAtom).toBe(true);
  expect(schema.nodes.image!.isBlock).toBe(true);
  expect(schema.nodes.inlineImage!.isAtom).toBe(true);
  expect(schema.nodes.inlineImage!.isInline).toBe(true);
  const html = toHTML(imageDoc);
  expect(html).toContain('<figure data-keel-image=""');
  expect(html).toContain('data-width="60"');
  expect(html).toContain('src="keel-file:f-1"');
  expect(html).toContain('<figcaption>ES 5m</figcaption>');
});

test('an image reads back from its figure, width and caption kept', () => {
  const back = fromHTML(toHTML(imageDoc));
  expect(findAll(back, 'image')[0]).toMatchObject({
    attrs: { src: 'keel-file:f-1', alt: 'Chart', width: 60, caption: 'ES 5m' },
  });
});

test('an image with no width or caption has neither in its figure', () => {
  const html = toHTML(
    docOf({ type: 'image', attrs: { src: 'keel-file:f-2', alt: 'x' } }),
  );
  expect(html).not.toContain('data-width');
  expect(html).not.toContain('figcaption');
  expect(findAll(fromHTML(html), 'image')[0]!.attrs).toMatchObject({
    width: null,
    caption: '',
  });
});

test('an inline image sits in its paragraph and reads back', () => {
  const doc = docOf({
    type: 'paragraph',
    content: [
      { type: 'text', text: 'See ' },
      {
        type: 'inlineImage',
        attrs: { src: 'keel-file:f-3', alt: 'Chip', width: 20 },
      },
      { type: 'text', text: ' here' },
    ],
  });
  const html = toHTML(doc);
  expect(html).toContain('<p>See <span data-keel-inline-image=""');
  const back = fromHTML(html);
  expect(findAll(back, 'inlineImage')[0]).toMatchObject({
    attrs: { src: 'keel-file:f-3', alt: 'Chip', width: 20 },
  });
});

test('a width read from outside is brought into range, or dropped', () => {
  const figure = (w: string) =>
    `<figure data-keel-image="" data-width="${w}"><img src="keel-file:f-1" alt=""></figure>`;
  const width = (w: string) =>
    findAll(fromHTML(figure(w)), 'image')[0]!.attrs?.width;
  expect(width('500')).toBe(100);
  expect(width('2')).toBe(10);
  expect(width('wide')).toBeNull();
});

test('a picture pasted as plain HTML is not kept: only a figure Keel wrote is an image', () => {
  const back = fromHTML(
    '<p>a</p><img src="https://example.com/x.png" alt="x"><p>b</p>',
  );
  expect(findAll(back, 'image')).toHaveLength(0);
  expect(findAll(back, 'inlineImage')).toHaveLength(0);
});

test('pickImage asks the bridge for a picker, and does nothing without one', () => {
  const calls: boolean[] = [];
  const bridge = {
    pick: (inline: boolean) => {
      calls.push(inline);
      return true;
    },
  };
  const editor = new Editor({
    extensions: noteExtensions(undefined, bridge),
    content: docOf(para('x')) as never,
  });
  editors.push(editor);
  expect(editor.commands.pickImage()).toBe(true);
  expect(editor.commands.pickImage(true)).toBe(true);
  expect(calls).toEqual([false, true]);
  const bare = make(docOf(para('x')));
  expect(bare.commands.pickImage()).toBe(false);
});

test('caretAt puts the caret in the nearest text, even from between blocks', () => {
  const editor = make(docOf(para('one'), para('two')));
  // Position 5 is between the two paragraphs.
  expect(editor.commands.caretAt(5)).toBe(true);
  const { $from } = editor.state.selection;
  expect($from.parent.textContent).toBe('two');
  const node: PMNode = editor.state.doc;
  expect(node.childCount).toBe(2);
});
