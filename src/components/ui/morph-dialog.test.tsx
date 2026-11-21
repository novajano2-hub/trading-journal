// @vitest-environment happy-dom
import { useRef, useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MorphDialog } from './morph-dialog';

afterEach(cleanup);

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)}>
        Open rule
      </button>
      <MorphDialog
        open={open}
        onOpenChange={setOpen}
        origin={ref}
        returnFocus={ref}
        title="Stop stays where it was placed"
        description="Broken on 2 trades"
      >
        <p>rows</p>
      </MorphDialog>
    </>
  );
}

test('named by its title; Escape closes and focus returns to the opener', async () => {
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open rule' });
  opener.focus();
  fireEvent.click(opener);
  const dialog = await screen.findByRole('dialog', {
    name: 'Stop stays where it was placed',
  });
  expect(dialog.textContent).toContain('Broken on 2 trades');
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(opener);
});

test('the close button closes it and is labelled', async () => {
  render(<Harness />);
  const opener = screen.getByRole('button', { name: 'Open rule' });
  fireEvent.click(opener);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(opener);
});
