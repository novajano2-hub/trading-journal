// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  RatingCell,
  RulesCell,
  StrategiesCell,
  TagsCell,
  TradeLink,
} from './cells';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));

afterEach(cleanup);

test('the trade link encodes an id that holds a slash', () => {
  render(<TradeLink id="acc:EUR/USD:f1">EUR/USD</TradeLink>);
  expect(screen.getByRole('link').getAttribute('href')).toBe(
    '/app/trades/acc%3AEUR%2FUSD%3Af1',
  );
});

const tag = (name: string) => ({ id: name, name, color: '#7E3F9E' });

test('Tags shows one whole chip and "+n" for the rest, the rest named in the title and to a screen reader', () => {
  const { container } = render(
    <TagsCell
      tags={[tag('opening range'), tag('calm'), tag('news')]}
      mistakes={[]}
    />,
  );
  // One chip (its name whole, untruncated by the cell) and one "+2".
  expect(screen.getByText('opening range')).toBeTruthy();
  expect(screen.queryByText('calm')).toBeNull();
  expect(screen.getByText('+2')).toBeTruthy();
  expect(container.querySelector('[title="calm, news"]')).not.toBeNull();
  expect(container.textContent).toContain('and calm and news');
});

test('Tags leads with a mistake, and one tag alone has no "+n"', () => {
  const { container, rerender } = render(
    <TagsCell tags={[tag('calm')]} mistakes={['fomo entry']} />,
  );
  expect(screen.getByText('fomo entry')).toBeTruthy();
  expect(screen.getByText('+1')).toBeTruthy();
  rerender(<TagsCell tags={[tag('calm')]} mistakes={[]} />);
  expect(container.textContent).not.toContain('+');
});

test('an absent strategy, rating and rule check each say it in words, never a dash', () => {
  const { container } = render(
    <>
      <StrategiesCell names={[]} />
      <RatingCell rating={undefined} />
      <RulesCell
        rules={{ kind: 'ungraded', kept: 0, checked: 0, broken: [] }}
      />
    </>,
  );
  const words = [...container.querySelectorAll('span')]
    .map((s) => s.textContent)
    .filter((t) => t === 'None' || t === 'Not graded' || t === '-');
  expect(words).toEqual(['None', 'None', 'Not graded']);
});
