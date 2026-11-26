// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { ScrollFade } from './scroll-fade';

afterEach(cleanup);

function box() {
  const { container } = render(
    <ScrollFade>
      <table />
    </ScrollFade>,
  );
  return container;
}

const fade = (c: HTMLElement) => c.querySelector('[data-scroll-fade]');

test('no fade while the content fits', () => {
  expect(fade(box())).toBeNull();
});

test('a fade shows while there is more to the right and goes at the end', () => {
  const { container } = render(
    <ScrollFade>
      <table />
    </ScrollFade>,
  );
  const scroller = container.querySelector('.overflow-x-auto') as HTMLElement;
  Object.defineProperty(scroller, 'scrollWidth', { value: 780 });
  Object.defineProperty(scroller, 'clientWidth', { value: 350 });
  scroller.scrollLeft = 0;
  act(() => {
    scroller.dispatchEvent(new Event('scroll'));
  });
  const shown = fade(container)!;
  expect(shown).toBeTruthy();
  expect(shown.getAttribute('aria-hidden')).toBe('true');
  expect(shown.className).toContain('pointer-events-none');
  scroller.scrollLeft = 430;
  act(() => {
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(fade(container)).toBeNull();
});

test('on the page ground the fade takes the ground colour, not the card white', () => {
  const { container } = render(
    <ScrollFade tone="bg" rootClassName="-mx-5">
      <nav />
    </ScrollFade>,
  );
  const scroller = container.querySelector('.overflow-x-auto') as HTMLElement;
  Object.defineProperty(scroller, 'scrollWidth', { value: 600 });
  Object.defineProperty(scroller, 'clientWidth', { value: 350 });
  act(() => {
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(fade(container)!.className).toContain('from-bg');
  expect(fade(container)!.className).not.toContain('from-surface-1');
  expect(container.firstElementChild!.className).toContain('-mx-5');
});

test('the scrolling box is positioned, so a visually hidden header inside it cannot widen the page', () => {
  const { container } = render(
    <ScrollFade>
      <table>
        <thead>
          <tr>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
      </table>
    </ScrollFade>,
  );
  // An absolutely placed child belongs to the nearest positioned ancestor, and
  // only the scroller clips: with the root as its box, the child would stick out.
  const scroller = container.querySelector('.overflow-x-auto') as HTMLElement;
  expect(scroller.className.split(' ')).toContain('relative');
});
