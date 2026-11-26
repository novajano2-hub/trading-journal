// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { renderApp } from './__fixtures__/render-app';
import { SampleLabel } from './sample-label';

afterEach(cleanup);

test('the phone badge says "Sample" beside the title, and folds into its words for assistive tech below 375px', async () => {
  renderApp(<SampleLabel badge />);
  const words = await screen.findByText('Sample data. Not a real account.');
  const badge = words.parentElement!;
  // A pill from sm down; where the title needs every pixel (below 375) only the words remain.
  expect(badge.className).toContain('sm:hidden');
  expect(badge.className).toContain('max-[374.98px]:sr-only');
  expect(screen.getByText('Sample').getAttribute('aria-hidden')).toBe('true');
});

test('the label beside the controls is for sm and up', async () => {
  renderApp(<SampleLabel />);
  const words = await screen.findByText('Sample data. Not a real account.');
  expect(words.parentElement!.className).toContain('max-sm:hidden');
});
