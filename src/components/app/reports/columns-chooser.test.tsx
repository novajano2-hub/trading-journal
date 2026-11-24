// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ColumnsChooser } from './columns-chooser';
import { REPORT_COLUMNS } from './report-columns';

afterEach(cleanup);

const ALL = REPORT_COLUMNS.map((c) => c.id);

function open() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Columns' }), {
    button: 0,
    ctrlKey: false,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
}

test('a tick flips at once, before the address catches up, and follows the address after', async () => {
  const onChange = vi.fn();
  const props = { labelOf: (_: string, f: string) => f, onReset() {} };
  const { rerender } = render(
    <ColumnsChooser {...props} shown={ALL} onChange={onChange} />,
  );
  open();
  const first = REPORT_COLUMNS[0]!;
  const box = (await screen.findByRole('checkbox', {
    name: first.label,
  })) as HTMLInputElement;
  expect(box.checked).toBe(true);
  // The caller has not changed `shown` yet (the URL is still updating).
  fireEvent.click(box);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(box.checked).toBe(false);
  // The address arrives with the same choice: still unticked.
  rerender(
    <ColumnsChooser
      {...props}
      shown={ALL.filter((id) => id !== first.id)}
      onChange={onChange}
    />,
  );
  expect(box.checked).toBe(false);
  // A reset from outside puts it back.
  rerender(<ColumnsChooser {...props} shown={ALL} onChange={onChange} />);
  expect(box.checked).toBe(true);
});
