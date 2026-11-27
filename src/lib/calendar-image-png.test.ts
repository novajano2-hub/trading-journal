// @vitest-environment happy-dom
// calendarPng draws the SVG to a canvas and hands back the PNG: the browser's
// image and canvas are stood in for, since the page has no renderer here.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { calendarPng, canCopyImage } from './calendar-image';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600"></svg>';

const order: string[] = [];
const draws: [number, number, number, number][] = [];
let failLoad = false;
let loadedSrc = '';

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    loadedSrc = value;
    order.push('load');
    queueMicrotask(() => (failLoad ? this.onerror?.() : this.onload?.()));
  }
}

const context = {
  drawImage: (_i: unknown, x: number, y: number, w: number, h: number) => {
    order.push('draw');
    draws.push([x, y, w, h]);
  },
};

class FakeOffscreen {
  constructor(
    public width: number,
    public height: number,
  ) {
    order.push(`offscreen ${width}x${height}`);
  }
  getContext() {
    return context;
  }
  convertToBlob(o: { type: string }) {
    return Promise.resolve(new Blob(['png'], { type: o.type }));
  }
}

beforeEach(() => {
  order.length = 0;
  draws.length = 0;
  failLoad = false;
  loadedSrc = '';
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreen);
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      get ready() {
        order.push('fonts');
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'fonts');
});

describe('calendarPng', () => {
  test('waits for the fonts, loads the SVG and draws it at twice its size into a PNG', async () => {
    const blob = await calendarPng(SVG);
    expect(blob.type).toBe('image/png');
    expect(order).toEqual(['fonts', 'load', 'offscreen 2000x1200', 'draw']);
    expect(draws).toEqual([[0, 0, 2000, 1200]]);
    // The SVG itself is what is drawn.
    expect(loadedSrc.startsWith('data:image/svg+xml')).toBe(true);
  });

  test('takes the scale it is given', async () => {
    await calendarPng(SVG, 3);
    expect(draws).toEqual([[0, 0, 3000, 1800]]);
  });

  test('uses a canvas element where there is no OffscreenCanvas', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const canvas = document.createElement('canvas');
    Object.assign(canvas, {
      getContext: () => context,
      toBlob: (done: (b: Blob | null) => void) =>
        done(new Blob(['png'], { type: 'image/png' })),
    });
    const make = vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const blob = await calendarPng(SVG);
    make.mockRestore();
    expect(blob.type).toBe('image/png');
    expect(canvas.width).toBe(2000);
    expect(canvas.height).toBe(1200);
    expect(draws).toEqual([[0, 0, 2000, 1200]]);
  });

  test('rejects when the SVG cannot be drawn', async () => {
    failLoad = true;
    await expect(calendarPng(SVG)).rejects.toThrow();
  });

  test('rejects when the canvas gives no PNG', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    const canvas = document.createElement('canvas');
    Object.assign(canvas, {
      getContext: () => context,
      toBlob: (done: (b: Blob | null) => void) => done(null),
    });
    const make = vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    await expect(calendarPng(SVG)).rejects.toThrow();
    make.mockRestore();
  });

  test('works without document.fonts', async () => {
    Reflect.deleteProperty(document, 'fonts');
    await expect(calendarPng(SVG)).resolves.toBeInstanceOf(Blob);
  });
});

describe('canCopyImage', () => {
  const clipboard = (write: unknown) =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: write === undefined ? undefined : { write },
    });

  afterEach(() => {
    Reflect.deleteProperty(window, 'ClipboardItem');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  test('is true only where ClipboardItem and clipboard.write both exist', () => {
    Reflect.deleteProperty(window, 'ClipboardItem');
    clipboard(() => Promise.resolve());
    expect(canCopyImage()).toBe(false);

    Object.defineProperty(window, 'ClipboardItem', {
      configurable: true,
      value: class {},
    });
    clipboard(undefined);
    expect(canCopyImage()).toBe(false);

    clipboard(() => Promise.resolve());
    expect(canCopyImage()).toBe(true);
  });
});
