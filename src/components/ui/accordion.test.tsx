import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Accordion } from './accordion';

const items = [
  { value: 'a', title: 'First?', content: 'One.' },
  { value: 'b', title: 'Second?', content: 'Two.' },
];

test('one section open by default, the rest closed and out of the tab order', () => {
  const html = renderToStaticMarkup(
    <Accordion items={items} defaultValue="a" />,
  );
  expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
  expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
  expect(html.match(/inert/g)).toHaveLength(1);
  expect(html).toContain('role="region"');
});
