// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  RatingCell,
  RulesCell,
  StrategiesCell,
  TagCountCell,
  TagsCell,
  TradeLink,
} from './cells';
import { cellOf, type CellEnv } from './columns';
import { makeTrade } from '@/domain/__fixtures__/trades';

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

test('a trade with no tags or mistakes says None in the Tags cell', () => {
  render(<TagsCell tags={[]} mistakes={[]} />);
  expect(screen.getByText('None').className).toContain('text-faint');
});

test('the tag count chip says "1 tag" or "n tags" and keeps every name for a screen reader', () => {
  const { container } = render(
    <TagCountCell tags={[tag('calm'), tag('news')]} mistakes={[]} />,
  );
  expect(container.textContent).toContain('2 tags');
  expect(container.textContent).toContain('calm and news');
  const chip = screen.getByText('2 tags').parentElement!;
  expect(chip.className).toContain('bg-sunken');
  cleanup();
  render(<TagCountCell tags={[tag('calm')]} mistakes={[]} />);
  expect(screen.getByText('1 tag')).toBeTruthy();
});

test('the tag count chip takes the marigold mistake treatment when any tag is a mistake', () => {
  render(<TagCountCell tags={[tag('calm')]} mistakes={['fomo entry']} />);
  const chip = screen.getByText('2 tags').parentElement!;
  expect(chip.className).toContain('bg-warn-soft');
  expect(chip.className).not.toContain('bg-sunken');
  expect(chip.textContent).toContain('fomo entry and calm');
});

test('the tag count chip is a faint None when the trade has no tags', () => {
  render(<TagCountCell tags={[]} mistakes={[]} />);
  expect(screen.getByText('None').className).toContain('text-faint');
});

test('the Day column carries the year, and only the Week view shortens it', () => {
  const t = makeTrade({
    net: 0,
    openedAt: '2026-11-19T15:00:00Z',
    closedAt: '2026-11-19T15:30:00Z',
  });
  const base = { timeZone: 'America/New_York' } as unknown as CellEnv;
  const { container, rerender } = render(<>{cellOf('day', t, base)}</>);
  expect(container.textContent).toBe('Thu 19 Nov 2026');
  rerender(<>{cellOf('day', t, { ...base, shortDay: true })}</>);
  expect(container.textContent).toBe('Thu 19 Nov');
});
