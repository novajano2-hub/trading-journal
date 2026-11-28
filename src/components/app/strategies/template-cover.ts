import type { StrategyTemplate } from '@/content/strategy-templates';
import type { NewFile } from '@/data/repository';

/** The drawing is 240 by 132; the stored picture is four times that. */
const SCALE = 4;
const WIDTH = 240 * SCALE;
const HEIGHT = 132 * SCALE;
/** An image that never loads must not hold a copy back. */
const LOAD_MS = 4000;

/** The SVG with a pixel size on its root, which an image needs to be drawn at a size. */
export function sized(svg: string, width: number, height: number): string {
  return svg.replace('<svg ', `<svg width="${width}" height="${height}" `);
}

/**
 * Draws the SVG onto a canvas and returns the PNG bytes. Null where the
 * browser cannot: no 2d canvas, an image that will not load, no encoder. The
 * canvas is checked first, so an environment without one answers at once.
 */
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<ArrayBuffer | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const url = URL.createObjectURL(
    new Blob([sized(svg, width, height)], {
      type: 'image/svg+xml;charset=utf-8',
    }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), LOAD_MS);
      image.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error('load'));
      };
      image.src = url;
    });
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    return blob ? await blob.arrayBuffer() : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The file a copy keeps as its photo: the template's cover drawn to a PNG when
 * the browser can, and the SVG itself when it cannot (the photo still shows,
 * as an image). Either way the cover is a file of the strategy's own, so the
 * photo field can replace or remove it later.
 */
export async function coverFile(
  t: StrategyTemplate,
  draw: typeof svgToPng = svgToPng,
): Promise<NewFile> {
  let png: ArrayBuffer | null = null;
  try {
    png = await draw(t.cover, WIDTH, HEIGHT);
  } catch {
    png = null;
  }
  if (png) return { bytes: png, type: 'image/png', name: `${t.id}.png` };
  return {
    bytes: new TextEncoder().encode(t.cover).buffer as ArrayBuffer,
    type: 'image/svg+xml',
    name: `${t.id}.svg`,
  };
}
