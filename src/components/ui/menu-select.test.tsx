// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { MenuSelect } from './menu-select';

afterEach(cleanup);

const OPTIONS = [
  { value: '', label: 'None' },
  { value: 'side', label: 'Side' },
  { value: 'symbol', label: 'Symbol' },
];

function Harness({ onPick }: { onPick?: (v: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <MenuSelect
      label="Cross-analyse by"
      value={value}
      onChange={(v) => {
        setValue(v);
        onPick?.(v);
      }}
      options={OPTIONS}
    />
  );
}

const trigger = (name: string) => screen.getByRole('button', { name });

test('the button is named by its label then its choice, and is not a native select', () => {
  const { container } = render(<Harness />);
  expect(trigger('Cross-analyse by, None').textContent).toBe('None');
  expect(container.querySelector('select')).toBeNull();
  expect(trigger('Cross-analyse by, None').getAttribute('aria-haspopup')).toBe(
    'menu',
  );
});

test('Enter opens the list, the arrows move, Enter picks, and the choice names the button', async () => {
  const onPick = vi.fn();
  render(<Harness onPick={onPick} />);
  fireEvent.keyDown(trigger('Cross-analyse by, None'), { key: 'Enter' });
  const items = await screen.findAllByRole('menuitemradio');
  expect(items.map((i) => i.textContent)).toEqual(['None', 'Side', 'Symbol']);
  // The checked option is the current one.
  expect(items[0]!.getAttribute('aria-checked')).toBe('true');
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
  await waitFor(() => expect(document.activeElement).toBe(items[1]));
  fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
  expect(onPick).toHaveBeenCalledWith('side');
  expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
  expect(trigger('Cross-analyse by, Side').textContent).toBe('Side');
});

test('ArrowDown on the button also opens it, and Escape closes it with nothing changed', async () => {
  const onPick = vi.fn();
  render(<Harness onPick={onPick} />);
  const button = trigger('Cross-analyse by, None');
  fireEvent.keyDown(button, { key: 'ArrowDown' });
  await screen.findAllByRole('menuitemradio');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
  expect(onPick).not.toHaveBeenCalled();
  expect(button.textContent).toBe('None');
});

test('a disabled select does not open', () => {
  render(
    <MenuSelect
      label="Move to folder"
      value=""
      onChange={() => {}}
      options={[{ value: '', label: 'No folder' }]}
      disabled
    />,
  );
  const button = trigger('Move to folder, No folder');
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(button, { key: 'Enter' });
  expect(screen.queryAllByRole('menuitemradio')).toHaveLength(0);
});
