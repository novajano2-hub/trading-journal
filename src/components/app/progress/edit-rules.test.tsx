// @vitest-environment happy-dom
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { fixtureSample } from '@/data/__fixtures__/sample';
import { createLocalRepository } from '@/data/local/local-repository';
import { SAMPLE_WORKSPACE } from '@/data/workspaces';
import { defaultVersion } from '@/domain/tracker/defaults';
import type { SampleWorkspace } from '@/data/seed/generate';
import { renderApp } from '../__fixtures__/render-app';
import { EditRules } from './edit-rules';

vi.mock('next/navigation', () => import('../__fixtures__/navigation'));
// Reduced motion: a button's ripple or the morph, cancelled by a dialog that closes at once, would reject in happy-dom.
vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => true,
}));

beforeEach(() => window.history.replaceState(null, '', '/app/progress'));
afterEach(cleanup);

const WS = SAMPLE_WORKSPACE.id;
const TODAY = '2026-11-19';

function Harness({ onClose }: { onClose?: (o: boolean) => void }) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref}>Edit rules</button>
      <EditRules
        open={open}
        origin={ref}
        onOpenChange={(o) => {
          setOpen(o);
          onClose?.(o);
        }}
      />
    </>
  );
}

function show(
  sample: () => SampleWorkspace = fixtureSample,
  onClose?: (o: boolean) => void,
  repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => sample(),
  }),
) {
  return renderApp(<Harness onClose={onClose} />, { repository });
}
const ready = () => screen.findByRole('dialog', { name: 'Edit rules' });
const save = () => screen.getByRole('button', { name: 'Save changes' });
const section = (name: string) =>
  screen.getByRole('heading', { name }).closest('section')!;
const tracker = (repo: ReturnType<typeof show>['repo']) => repo.tracker.get(WS);

test('Save stays disabled until something changes', async () => {
  show();
  await ready();
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(
    screen.getByRole('switch', { name: 'Every trade has a strategy' }),
  );
  expect((save() as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(
    screen.getByRole('switch', { name: 'Every trade has a strategy' }),
  );
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Changes count from today/)).toBeTruthy();
  // No streak-email control: there is no email to send.
  expect(screen.queryByText(/email|reminder/i)).toBeNull();
});

test('saving writes a version from today and closes', async () => {
  const closed = vi.fn();
  const { repo } = show(fixtureSample, closed);
  await ready();
  fireEvent.click(
    screen.getByRole('switch', { name: 'Every trade has a planned stop' }),
  );
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Trading days' })).getByRole(
      'button',
      { name: 'Tue' },
    ),
  );
  fireEvent.click(save());
  await waitFor(() => expect(closed).toHaveBeenCalledWith(false));
  const t = await tracker(repo);
  const last = t.versions[t.versions.length - 1]!;
  expect(last.from).toBe(TODAY);
  expect(last.builtIn.stop.on).toBe(false);
  expect(last.builtIn.strategy.on).toBe(true);
  expect(last.tradingDays[2]).toBe(false);
  // Earlier versions are untouched.
  expect(t.versions[0]).toEqual(defaultVersion('2026-11-02'));
});

test('a new custom rule defaults to Monday to Friday', async () => {
  const { repo } = show();
  await ready();
  fireEvent.click(
    within(section('Trade')).getByRole('button', { name: 'Add rule' }),
  );
  const name = screen.getByRole('textbox', { name: 'New rule name' });
  const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
  expect(add.disabled).toBe(true);
  const days = within(
    screen.getByRole('group', { name: 'Days for the new rule' }),
  );
  expect(
    days.getAllByRole('button').map((b) => b.getAttribute('aria-pressed')),
  ).toEqual(['true', 'true', 'true', 'true', 'true', 'false', 'false']);
  fireEvent.change(name, {
    target: { value: 'No entries in the first 10 minutes' },
  });
  expect(add.disabled).toBe(false);
  fireEvent.click(add);
  expect(screen.queryByRole('textbox', { name: 'New rule name' })).toBeNull();
  expect(
    within(section('Trade')).getByText('No entries in the first 10 minutes'),
  ).toBeTruthy();
  fireEvent.click(save());
  await waitFor(async () => {
    const t = await tracker(repo);
    expect(t.versions[t.versions.length - 1]!.custom).toHaveLength(1);
  });
  const t = await tracker(repo);
  const rule = t.versions[t.versions.length - 1]!.custom[0]!;
  expect(rule).toMatchObject({
    name: 'No entries in the first 10 minutes',
    stage: 'trade',
    days: [false, true, true, true, true, true, false],
  });
});

test('a custom rule can be deleted and a new one discarded', async () => {
  const { repo } = show(() => {
    const s = fixtureSample();
    const v = defaultVersion('2026-11-02');
    v.custom = [
      { id: 'c1', name: 'Walk first', stage: 'prepare', days: v.tradingDays },
    ];
    return { ...s, tracker: { ...s.tracker, versions: [v] } };
  });
  await ready();
  fireEvent.click(
    within(section('Prepare')).getByRole('button', { name: 'Add rule' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Discard the new rule' }));
  expect(screen.queryByRole('textbox', { name: 'New rule name' })).toBeNull();
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Delete Walk first' }));
  expect(screen.queryByText('Walk first')).toBeNull();
  fireEvent.click(save());
  await waitFor(async () => {
    const t = await tracker(repo);
    expect(t.versions[t.versions.length - 1]!.custom).toEqual([]);
  });
});

test('reset asks once, then restarts the tracker today', async () => {
  const closed = vi.fn();
  const { repo } = show(() => {
    const s = fixtureSample();
    const v = defaultVersion('2026-11-02');
    v.custom = [
      { id: 'c1', name: 'Walk first', stage: 'prepare', days: v.tradingDays },
    ];
    return { ...s, tracker: { ...s.tracker, versions: [v] } };
  }, closed);
  await ready();
  fireEvent.click(screen.getByRole('button', { name: 'Reset progress' }));
  const ask = await screen.findByRole('dialog', {
    name: 'Reset all progress?',
  });
  // Nothing happened yet.
  expect((await tracker(repo)).startedOn).toBe('2026-11-02');
  fireEvent.click(within(ask).getByRole('button', { name: 'Reset progress' }));
  await waitFor(() => expect(closed).toHaveBeenCalledWith(false));
  const t = await tracker(repo);
  expect(t.startedOn).toBe(TODAY);
  expect(t.versions).toHaveLength(1);
  expect(t.versions[0]!.custom).toEqual([]);
});

test('times are 24-hour selects in quarter hours, and an hours range must run forward', async () => {
  show();
  await ready();
  const start = screen.getByRole('combobox', {
    name: 'Start by time',
  }) as HTMLSelectElement;
  const times = [...start.options].map((o) => o.value);
  expect(times).toHaveLength(96);
  expect(times[0]).toBe('00:00');
  expect(times[1]).toBe('00:15');
  expect(times[95]).toBe('23:45');
  fireEvent.change(start, { target: { value: '09:45' } });
  expect((save() as HTMLButtonElement).disabled).toBe(false);

  fireEvent.click(screen.getByRole('switch', { name: 'Trade only between' }));
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Trading hours from' }),
    {
      target: { value: '13:00' },
    },
  );
  expect(screen.getByText('The start must be before the end.')).toBeTruthy();
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('combobox', { name: 'Trading hours to' }), {
    target: { value: '14:30' },
  });
  expect(screen.queryByText('The start must be before the end.')).toBeNull();
  expect((save() as HTMLButtonElement).disabled).toBe(false);
});

test('amounts and percents must be positive, a percent at most 100', async () => {
  show();
  await ready();
  const day = screen.getByRole('textbox', { name: 'Daily loss limit' });
  fireEvent.change(day, { target: { value: '0' } });
  expect(screen.getByText('Enter an amount above 0.')).toBeTruthy();
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(day, { target: { value: '250' } });
  expect((save() as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('radio', { name: '%' }));
  const trade = screen.getByRole('textbox', { name: 'Per-trade loss limit' });
  fireEvent.change(trade, { target: { value: '101' } });
  expect(screen.getByText('Enter a percent above 0, up to 100.')).toBeTruthy();
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(trade, { target: { value: '2.5' } });
  expect((save() as HTMLButtonElement).disabled).toBe(false);
});

test('a custom name is 1 to 80 characters', async () => {
  show();
  await ready();
  fireEvent.click(
    within(section('Reflect')).getByRole('button', { name: 'Add rule' }),
  );
  const name = screen.getByRole('textbox', { name: 'New rule name' });
  const add = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
  fireEvent.change(name, { target: { value: '   ' } });
  expect(add.disabled).toBe(true);
  fireEvent.change(name, { target: { value: 'x'.repeat(81) } });
  expect(add.disabled).toBe(true);
  expect(screen.getByText('Use 80 characters or fewer.')).toBeTruthy();
  fireEvent.change(name, { target: { value: 'x'.repeat(80) } });
  expect(add.disabled).toBe(false);
});

test("trading hours show the zone's GMT offset", async () => {
  const repository = createLocalRepository({
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    sample: async () => fixtureSample(),
  });
  await repository.prefs.update({ timeZone: 'Asia/Kolkata' });
  show(fixtureSample, undefined, repository);
  await ready();
  await waitFor(() =>
    expect(within(section('Trade')).getByText('GMT+5:30')).toBeTruthy(),
  );
});

test('on a phone it is a full-height sheet with a fixed footer', async () => {
  show();
  const dialog = await ready();
  expect(dialog.className).toContain('bottom-0');
  expect(dialog.className).toContain('top-3');
  const scroller = dialog.querySelector('.overflow-y-auto')!;
  expect(scroller.contains(save())).toBe(false);
  expect(
    scroller.contains(screen.getByRole('button', { name: 'Cancel' })),
  ).toBe(false);
  expect(dialog.contains(save())).toBe(true);
});
