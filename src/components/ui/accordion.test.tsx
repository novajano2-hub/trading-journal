import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Accordion } from './accordion';

const items = [
  { value: 'a', title: 'First?', content: 'One.' },
  { value: 'b', title: 'Second?', content: 'Two.' },
];

test('server markup keeps every answer open and reachable; the first is the one expanded', () => {
  const html = renderToStaticMarkup(
    <Accordion items={items} defaultValue="a" />,
  );
  expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
  expect(html).not.toContain('inert');
  expect(html).not.toContain('grid-rows-[0fr]');
  expect(html).toContain('role="region"');
});
