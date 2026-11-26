// @vitest-environment happy-dom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { svgDataUrl } from '@/lib/calendar-image';
import { SnapshotPanel } from './snapshot-panel';

const calendarPng = vi.hoisted(() => vi.fn<(svg: string) => Promise<Blob>>());
vi.mock('@/lib/calendar-image', async (original) => ({
  ...(await original<typeof import('@/lib/calendar-image')>()),
  calendarPng,
}));

MotionGlobalConfig.skipAnimations = true;

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600"><text>November</text></svg>';
const PNG = new Blob(['png'], { type: 'image/png' });

const renderPanel = (
  over: Partial<Parameters<typeof SnapshotPanel>[0]> = {},
) => {
  const onClose = vi.fn();
  const returnFocus = createRef<HTMLElement>();
  const view = render(
    <SnapshotPanel
      open
      onClose={onClose}
      month="2026-11"
      monthName="November 2026"
      unit="in dollars"
      svg={SVG}
      returnFocus={returnFocus}
      {...over}
    />,
  );
  return { ...view, onClose, returnFocus };
};

/** The browser can copy an image: ClipboardItem and clipboard.write. */
const canCopy = (
  write: (items: unknown[]) => Promise<void> = async () => {},
) => {
  class Item {
    constructor(public items: Record<string, Blob>) {}
  }
  Object.defineProperty(window, 'ClipboardItem', {
    configurable: true,
    value: Item,
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { write },
  });
  return Item;
};

const created: string[] = [];
let clicks: { download: string; href: string }[] = [];

beforeEach(() => {
  calendarPng.mockReset();
  calendarPng.mockResolvedValue(PNG);
  Reflect.deleteProperty(window, 'ClipboardItem');
  Reflect.deleteProperty(navigator, 'clipboard');
  created.length = 0;
  clicks = [];
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    created.push(blob instanceof Blob ? blob.type : 'source');
    return 'blob:keel-calendar';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'ClipboardItem');
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'canShare');
});

/** A phone or tablet (a coarse pointer), or a mouse; every other query answers as the browser does. */
const pointer = (kind: 'coarse' | 'fine') => {
  const real = window.matchMedia.bind(window);
  vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
    /pointer:\s*coarse/.test(query)
      ? ({
          matches: kind === 'coarse',
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        } as unknown as MediaQueryList)
      : real(query),
  );
};

/** The device's share sheet: `canShare` says whether it takes this file, `share` what the visitor does there. */
const sharing = (
  share: (data: ShareData) => Promise<void> = async () => {},
  canShare: (data: ShareData) => boolean = () => true,
) => {
  const spy = vi.fn(share);
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: spy,
  });
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    value: vi.fn(canShare),
  });
  return spy;
};

describe('the panel', () => {
  test('opens as a dialog named Calendar image, with the preview of the SVG and what it is', async () => {
    renderPanel();
    const panel = await screen.findByRole('dialog', {
      name: 'Calendar image',
    });
    const preview = await within(panel).findByRole('img', {
      name: 'Preview of the November 2026 calendar image',
    });
    expect(preview.getAttribute('src')).toBe(svgDataUrl(SVG));
    expect(panel.textContent).toContain(
      'November 2026 as shown: your chosen stats, in dollars.',
    );
    expect(panel.textContent).toContain('keel-calendar-2026-11.png');
    // The style-image action is not built (C43).
    expect(within(panel).queryByText(/style/i)).toBeNull();
  });

  test('closed, it draws nothing and makes no image', () => {
    renderPanel({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calendarPng).not.toHaveBeenCalled();
  });

  test('renders the PNG from the SVG when it opens', async () => {
    renderPanel();
    await screen.findByRole('img');
    expect(calendarPng).toHaveBeenCalledTimes(1);
    expect(calendarPng).toHaveBeenCalledWith(SVG);
  });

  test('while the image renders the panel shows a skeleton, not a preview', async () => {
    calendarPng.mockReturnValue(new Promise(() => {}));
    renderPanel();
    const panel = await screen.findByRole('dialog');
    expect(
      panel.querySelector('[data-testid="snapshot-skeleton"]'),
    ).not.toBeNull();
    expect(within(panel).queryByRole('img')).toBeNull();
  });

  test('a new SVG, as when a stat is switched, makes a new image', async () => {
    const { rerender, onClose, returnFocus } = renderPanel();
    await screen.findByRole('img');
    const next = SVG.replace('November', 'Nov');
    rerender(
      <SnapshotPanel
        open
        onClose={onClose}
        month="2026-11"
        monthName="November 2026"
        unit="in dollars"
        svg={next}
        returnFocus={returnFocus}
      />,
    );
    await waitFor(() => expect(calendarPng).toHaveBeenCalledWith(next));
    expect(calendarPng).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByRole('img').getAttribute('src')).toBe(
        svgDataUrl(next),
      ),
    );
  });
});

describe('Download image', () => {
  test('saves keel-calendar-YYYY-MM.png', async () => {
    renderPanel();
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Download image' }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(created).toEqual(['image/png']);
    expect(clicks[0]).toEqual({
      download: 'keel-calendar-2026-11.png',
      href: 'blob:keel-calendar',
    });
  });

  test('the file is named for the month shown', async () => {
    renderPanel({ month: '2027-01', monthName: 'January 2027' });
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Download image' }));
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0]!.download).toBe('keel-calendar-2027-01.png');
  });
});

describe('Download image on a device that can share (D-05)', () => {
  const press = async () => {
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Download image' }));
  };

  test('a phone hands the PNG to its share sheet, named for the month, and saves no link', async () => {
    pointer('coarse');
    const share = sharing();
    renderPanel();
    await press();
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const { files } = share.mock.calls[0]![0] as { files: File[] };
    expect(files).toHaveLength(1);
    expect(files[0]!.name).toBe('keel-calendar-2026-11.png');
    expect(files[0]!.type).toBe('image/png');
    expect(navigator.canShare).toHaveBeenCalledWith({ files });
    expect(clicks).toEqual([]);
  });

  test('a mouse saves the file even where the browser can share', async () => {
    pointer('fine');
    const share = sharing();
    renderPanel();
    await press();
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(share).not.toHaveBeenCalled();
  });

  test('a phone whose browser cannot share this file saves it', async () => {
    pointer('coarse');
    const share = sharing(undefined, () => false);
    renderPanel();
    await press();
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(share).not.toHaveBeenCalled();
  });

  test('a phone without the share sheet at all saves it', async () => {
    pointer('coarse');
    renderPanel();
    await press();
    await waitFor(() => expect(clicks).toHaveLength(1));
  });

  test('closing the share sheet is not a failure: nothing is saved behind its back', async () => {
    pointer('coarse');
    const share = sharing(async () => {
      throw new DOMException('closed', 'AbortError');
    });
    renderPanel();
    await press();
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(clicks).toEqual([]);
  });

  test('a share sheet that fails falls back to saving the file', async () => {
    pointer('coarse');
    sharing(async () => {
      throw new DOMException('no', 'NotAllowedError');
    });
    renderPanel();
    await press();
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0]!.download).toBe('keel-calendar-2026-11.png');
  });
});

describe('Copy image (C46)', () => {
  test('writes image/png to the clipboard and says so', async () => {
    const write = vi.fn(async () => {});
    const Item = canCopy(write);
    renderPanel();
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Copy image' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const items = (
      write.mock.calls[0] as unknown as [InstanceType<typeof Item>[]]
    )[0];
    expect(items).toHaveLength(1);
    expect(items[0]).toBeInstanceOf(Item);
    expect(Object.keys(items[0]!.items)).toEqual(['image/png']);
    expect(items[0]!.items['image/png']).toBe(PNG);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Copied to the clipboard.',
      ),
    );
  });

  test('without ClipboardItem the button is replaced by a line, and nothing is disabled', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { write: async () => {} },
    });
    renderPanel();
    const panel = await screen.findByRole('dialog');
    await within(panel).findByRole('img');
    expect(within(panel).queryByRole('button', { name: /copy/i })).toBeNull();
    expect(
      within(panel).getByText(
        "This browser can't copy images. Download saves or shares the file.",
      ),
    ).toBeTruthy();
    for (const b of within(panel).getAllByRole('button'))
      expect((b as HTMLButtonElement).disabled).toBe(false);
  });

  test('without clipboard.write it is the same line', async () => {
    canCopy();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {},
    });
    renderPanel();
    await screen.findByRole('img');
    expect(screen.queryByRole('button', { name: 'Copy image' })).toBeNull();
    expect(screen.getByText(/can't copy images/)).toBeTruthy();
  });

  test('where it can copy there is no line about not copying', async () => {
    canCopy();
    renderPanel();
    await screen.findByRole('img');
    expect(screen.queryByText(/can't copy images/)).toBeNull();
  });

  test('a copy the browser refuses says so and points to Download', async () => {
    canCopy(async () => {
      throw new DOMException('no', 'NotAllowedError');
    });
    renderPanel();
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Copy image' }));
    expect(
      await screen.findByText(
        "Couldn't copy the image. Download saves or shares the file.",
      ),
    ).toBeTruthy();
  });
});

describe('a render that fails', () => {
  test("says Couldn't make the image with Try again, and no Download", async () => {
    calendarPng.mockRejectedValue(new Error('no canvas'));
    renderPanel();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain("Couldn't make the image");
    expect(
      within(alert).getByRole('button', { name: 'Try again' }),
    ).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download image' })).toBeNull();
  });

  test('Try again renders it again and shows the preview', async () => {
    calendarPng.mockRejectedValueOnce(new Error('no canvas'));
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('img')).toBeTruthy();
    expect(calendarPng).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('closing', () => {
  test('the close control closes it', async () => {
    const { onClose } = renderPanel();
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape closes it', async () => {
    const { onClose } = renderPanel();
    const panel = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.keyDown(panel, { key: 'Escape' });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('a click on the page behind leaves it open: the calendar stays in use', async () => {
    const { onClose } = renderPanel();
    await screen.findByRole('img');
    await act(async () => {
      fireEvent.pointerDown(document.body);
      fireEvent.click(document.body);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
