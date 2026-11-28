// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { STRATEGY_TEMPLATES } from '@/content/strategy-templates';
import { coverFile, sized, svgToPng } from './template-cover';

const t = STRATEGY_TEMPLATES[2]!;
const PNG = new Uint8Array([137, 80, 78, 71]).buffer;
const text = (b: ArrayBuffer) => new TextDecoder().decode(b);

test('the cover is stored as a PNG when the browser can draw it', async () => {
  const draw = vi.fn(async () => PNG);
  const file = await coverFile(t, draw);
  expect(file.type).toBe('image/png');
  expect(file.name).toBe('london-range-break.png');
  expect(file.bytes).toBe(PNG);
  // Drawn at four times the SVG's own 240 by 132.
  expect(draw).toHaveBeenCalledWith(t.cover, 960, 528);
});

test('with no canvas, the cover is stored as the SVG itself', async () => {
  const file = await coverFile(t, async () => null);
  expect(file.type).toBe('image/svg+xml');
  expect(file.name).toBe('london-range-break.svg');
  expect(text(file.bytes)).toBe(t.cover);
});

test('a drawing that throws falls back to the SVG, and the copy still gets a cover', async () => {
  const file = await coverFile(t, async () => {
    throw new Error('decode failed');
  });
  expect(file.type).toBe('image/svg+xml');
});

test('where there is no 2d canvas (this environment), drawing returns nothing at once', async () => {
  expect(await svgToPng(t.cover, 960, 528)).toBeNull();
});

test('the SVG is given its pixel size for the drawing, and keeps its viewBox', () => {
  const out = sized(t.cover, 960, 528);
  expect(out).toContain('width="960" height="528"');
  expect(out).toContain('viewBox="0 0 240 132"');
  expect(out.startsWith('<svg ')).toBe(true);
});
