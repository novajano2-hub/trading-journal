// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { renderApp } from '../__fixtures__/render-app';
import { TradingSettings } from './trading';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

function repo() {
  return createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
}
const show = (r: ReturnType<typeof repo>) =>
  renderApp(<TradingSettings />, {
    repository: r,
    url: '/app/settings/trading',
  });

test('instruments are chips that toggle and save', async () => {
  const r = repo();
  show(r);
  const futures = await screen.findByRole('checkbox', { name: 'Futures' });
  expect((futures as HTMLInputElement).checked).toBe(false);
  fireEvent.click(futures);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Forex' }));
  await waitFor(async () =>
    expect((await r.prefs.get()).instrumentsTraded).toEqual([
      'future',
      'forex',
    ]),
  );
  fireEvent.click(screen.getByRole('checkbox', { name: 'Futures' }));
  await waitFor(async () =>
    expect((await r.prefs.get()).instrumentsTraded).toEqual(['forex']),
  );
});

test('the breakeven range saves in dollars, or in percent as a fraction', async () => {
  const r = repo();
  show(r);
  const from = await screen.findByLabelText('From');
  const to = screen.getByLabelText('To');
  fireEvent.change(from, { target: { value: '-5' } });
  fireEvent.blur(from);
  fireEvent.change(to, { target: { value: '10.50' } });
  fireEvent.blur(to);
  await waitFor(async () =>
    expect((await r.prefs.get()).breakevenRange).toEqual({
      unit: 'amount',
      from: -500,
      to: 1050,
    }),
  );
  fireEvent.click(screen.getByRole('radio', { name: '%' }));
  await waitFor(async () =>
    expect((await r.prefs.get()).breakevenRange.unit).toBe('percent'),
  );
  // The page follows the store a moment later; typing before it has would be over the dollar range.
  await waitFor(() =>
    expect(
      (screen.getByRole('radio', { name: '%' }) as HTMLInputElement).checked,
    ).toBe(true),
  );
  const pctTo = screen.getByLabelText('To');
  fireEvent.change(pctTo, { target: { value: '0.1' } });
  fireEvent.blur(pctTo);
  await waitFor(async () =>
    expect((await r.prefs.get()).breakevenRange).toMatchObject({
      unit: 'percent',
      to: 0.001,
    }),
  );
});

test('a range that runs high to low is refused, with the reason', async () => {
  const r = repo();
  show(r);
  const from = await screen.findByLabelText('From');
  fireEvent.change(from, { target: { value: '5' } });
  fireEvent.blur(from);
  expect(await screen.findByText('From must be at most To.')).toBeTruthy();
  expect((await r.prefs.get()).breakevenRange).toEqual({
    unit: 'amount',
    from: 0,
    to: 0,
  });
});

test('the range error is an alert that both fields point to', async () => {
  show(repo());
  const from = await screen.findByLabelText('From');
  fireEvent.change(from, { target: { value: '5' } });
  fireEvent.blur(from);
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('From must be at most To.');
  expect(from.getAttribute('aria-describedby')).toBe(alert.id);
  expect(screen.getByLabelText('To').getAttribute('aria-describedby')).toBe(
    alert.id,
  );
});

test('the basis copy points to the Display menu, not the top bar', async () => {
  const { container } = show(repo());
  await screen.findByLabelText('From');
  expect(container.textContent).toContain('Display menu');
  expect(container.textContent).not.toContain('top bar');
});

test('settling expired options and the default basis are saved', async () => {
  const r = repo();
  show(r);
  const toggle = await screen.findByRole('switch', {
    name: 'Settle expired options at zero',
  });
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(toggle);
  fireEvent.click(screen.getByRole('radio', { name: 'Gross' }));
  await waitFor(async () =>
    expect(await r.prefs.get()).toMatchObject({
      settleExpiredOptions: false,
      pnlBasis: 'gross',
    }),
  );
});

test('weeks start on Sunday until Monday is chosen, and the choice saves', async () => {
  const r = repo();
  show(r);
  const sunday = await screen.findByRole('radio', { name: 'Sunday' });
  expect((sunday as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: 'Monday' }));
  await waitFor(async () =>
    expect((await r.prefs.get()).weekStart).toBe('monday'),
  );
});
