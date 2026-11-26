// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NoteEditor, type NoteEditorHandle } from './note-editor';
import { DAILY_REVIEW_BODY } from '@/content/note-templates';

afterEach(cleanup);

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Held the plan' }] },
  ],
};

test('renders the given doc text', async () => {
  render(<NoteEditor value={doc} onChange={() => {}} label="Trade note" />);
  expect(await screen.findByText('Held the plan')).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Trade note' })).toBeTruthy();
});

test('the slash command Checklist produces a taskList through onChange', async () => {
  const onChange = vi.fn();
  const ref: { current: NoteEditorHandle | null } = { current: null };
  render(
    <NoteEditor
      value={doc}
      onChange={onChange}
      label="Trade note"
      handleRef={ref}
    />,
  );
  await waitFor(() => expect(ref.current).not.toBeNull());
  act(() => ref.current!.runSlashCommand('Checklist'));
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  const last = onChange.mock.calls.at(-1)![0];
  expect(JSON.stringify(last)).toContain('"taskList"');
});

test('read-only shows no toolbar', async () => {
  render(
    <NoteEditor value={doc} onChange={() => {}} label="Trade note" readOnly />,
  );
  await screen.findByText('Held the plan');
  expect(screen.queryByRole('toolbar')).toBeNull();
});

test('the toolbar is named and toggles carry aria-pressed', async () => {
  render(<NoteEditor value={doc} onChange={() => {}} label="Trade note" />);
  const bar = await screen.findByRole('toolbar', { name: 'Formatting' });
  expect(bar).toBeTruthy();
  const bold = screen.getByRole('button', { name: 'Bold' });
  expect(bold.getAttribute('aria-pressed')).toBe('false');
  // The headings and lists moved into the Style menu; the marks are buttons.
  for (const n of [
    'Italic',
    'Underline',
    'Link',
    'Undo',
    'Redo',
    'Style: Normal text',
    'Insert',
  ]) {
    expect(screen.getByRole('button', { name: n })).toBeTruthy();
  }
});

test('the Style menu keeps the headings, lists, checklist and quote the toolbar had', async () => {
  render(<NoteEditor value={doc} onChange={() => {}} label="Trade note" />);
  fireEvent.keyDown(
    await screen.findByRole('button', { name: 'Style: Normal text' }),
    { key: 'Enter' },
  );
  for (const n of [
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Bulleted list',
    'Numbered list',
    'Checklist',
    'Quote',
  ]) {
    expect(await screen.findByRole('menuitemradio', { name: n })).toBeTruthy();
  }
});

test('the daily review template renders with collapsible sections', async () => {
  render(
    <NoteEditor value={DAILY_REVIEW_BODY} onChange={() => {}} label="Note" />,
  );
  await screen.findByText('Watchlist');
  const carets = await screen.findAllByRole('button', {
    name: /collapse section/i,
  });
  expect(carets.length).toBe(3);
  expect(carets[0]!.getAttribute('aria-expanded')).toBe('true');
});
