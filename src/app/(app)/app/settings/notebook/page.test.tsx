import { isValidElement } from 'react';
import { expect, test, vi } from 'vitest';
import { NotebookSettings } from '@/components/app/settings/notebook-settings';
import NotebookSettingsPage, { metadata } from './page';

vi.mock('next/navigation', () => ({}));

test('the route /app/settings/notebook shows the note settings, titled for the tab', () => {
  expect(metadata.title).toBe('Notebook settings');
  const page = NotebookSettingsPage();
  expect(isValidElement(page)).toBe(true);
  expect(page.type).toBe(NotebookSettings);
});
