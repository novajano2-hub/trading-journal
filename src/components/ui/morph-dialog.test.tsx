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

test('a footer is pinned under the scrolling body, never inside it', async () => {
  function WithFooter() {
    const ref = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={ref}>Open</button>
        <MorphDialog
          open
          onOpenChange={() => {}}
          origin={ref}
          returnFocus={ref}
          title="Choose"
          footer={<button>Save</button>}
        >
          <p>rows</p>
        </MorphDialog>
      </>
    );
  }
  render(<WithFooter />);
  const dialog = await screen.findByRole('dialog');
  const save = screen.getByRole('button', { name: 'Save' });
  const scroller = screen.getByText('rows').parentElement!;
  expect(scroller.className).toContain('overflow-y-auto');
  expect(scroller.contains(save)).toBe(false);
  expect(dialog.contains(save)).toBe(true);
  expect(scroller.parentElement).toBe(save.parentElement!.parentElement);
});

test('the form size is a full-height sheet on a phone and a 460px dialog from sm', async () => {
  function Form() {
    const ref = useRef<HTMLButtonElement>(null);
    return (
      <>
        <button ref={ref}>Open</button>
        <MorphDialog
          open
          onOpenChange={() => {}}
          origin={ref}
          returnFocus={ref}
          title="Log a payout"
          size="form"
        >
          <p>fields</p>
        </MorphDialog>
      </>
    );
  }
  render(<Form />);
  const classes = (await screen.findByRole('dialog')).className.split(' ');
  // The sheet's phone look (top gutter, no bottom gap), then its own width.
  expect(classes).toContain('top-3');
  expect(classes).toContain('bottom-0');
  expect(classes).toContain('sm:max-w-[460px]');
  expect(classes).not.toContain('sm:max-w-[760px]');
});
