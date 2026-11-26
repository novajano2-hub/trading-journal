// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  DEFAULT_COLUMNS,
  ALL_COLUMNS,
  type ColumnId,
} from '@/data/trade-columns';
import { ColumnsMenu } from './columns-menu';

MotionGlobalConfig.skipAnimations = true;

afterEach(cleanup);

function open(columns: ColumnId[] = ['open', 'side', 'net']) {
  const onSave = vi.fn();
  render(
    <ColumnsMenu
      columns={columns}
      defaults={DEFAULT_COLUMNS}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  return onSave;
}

test('a change is held until Update saves it', async () => {
  const onSave = open();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Side' }));
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(onSave).toHaveBeenCalledWith(['open', 'net']);
});

test('closing without Update throws the change away', async () => {
  const onSave = open();
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Side' }));
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  expect(
    (await screen.findByRole('checkbox', { name: 'Side' })) as HTMLInputElement,
  ).toHaveProperty('checked', true);
});

test('the search box filters both lists', async () => {
  open();
  fireEvent.change(
    await screen.findByRole('searchbox', { name: 'Search columns' }),
    {
      target: { value: 'si' },
    },
  );
  expect(screen.getByRole('checkbox', { name: 'Side' })).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'Open' })).toBeNull();
  // A hidden column that matches stays listed.
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search columns' }), {
    target: { value: 'rating' },
  });
  expect(screen.getByRole('checkbox', { name: 'Rating' })).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'Side' })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search columns' }), {
    target: { value: 'zzz' },
  });
  expect(screen.getByText('No column matches.')).toBeTruthy();
});

test('Select all shows every column, Reset to default brings the defaults back', async () => {
  const onSave = open();
  fireEvent.click(await screen.findByRole('button', { name: 'Select all' }));
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(new Set(onSave.mock.calls[0]![0])).toEqual(new Set(ALL_COLUMNS));
  expect(onSave.mock.calls[0]![0].slice(0, 3)).toEqual(['open', 'side', 'net']);

  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Reset to default' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(onSave.mock.calls[1]![0]).toEqual(DEFAULT_COLUMNS);
});

test('the last column cannot be switched off', async () => {
  open(['net']);
  expect(
    (await screen.findByRole('checkbox', {
      name: 'Net P&L',
    })) as HTMLInputElement,
  ).toHaveProperty('disabled', true);
});

test('a column moves up and down before Update', async () => {
  const onSave = open();
  fireEvent.click(
    await screen.findByRole('button', { name: 'Move Net P&L up' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(onSave).toHaveBeenCalledWith(['open', 'net', 'side']);
});
