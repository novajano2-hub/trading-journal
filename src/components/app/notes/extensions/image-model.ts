// What a note's image is, apart from how it draws: the reference a body
// stores, the width it keeps, and the bridge between the editor's plugins and
// the React that stores files. Pure, so the node view, the extension and the
// editor can all import it.

/** A body stores `keel-file:<id>`; the editor resolves it to an object URL when the image shows. */
export const FILE_REF = 'keel-file:';

export const refOf = (id: string): string => `${FILE_REF}${id}`;

/** The file id in a stored `src`, or undefined for anything else (an outside address is never loaded). */
export function fileIdOf(src: unknown): string | undefined {
  return typeof src === 'string' &&
    src.startsWith(FILE_REF) &&
    src.length > FILE_REF.length
    ? src.slice(FILE_REF.length)
    : undefined;
}

/** An image is drawn between 10 and 100 percent of the width of the block it sits in. */
export const MIN_WIDTH = 10;
export const MAX_WIDTH = 100;

/** A stored width as a whole percentage in range, or null (the image's own size). */
export function widthOf(value: unknown): number | null {
  const n =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(n)));
}

/** A width in pixels as a percentage of the block's width. */
export const percentOf = (px: number, container: number): number =>
  container > 0 ? (widthOf((px / container) * 100) ?? MAX_WIDTH) : MAX_WIDTH;

/**
 * What the editor's pieces say to each other about images. Each answers
 * whether it took the request: a note that cannot take images answers no, and
 * the editor treats a paste or a drop as it would any other.
 */
export interface ImageBridge {
  /** Opens the file picker: for a block image, or an inline one. */
  pick(inline: boolean): boolean;
  /** Whether this note takes images at all (menus leave Image out where it does not). */
  canPick(): boolean;
  /** Stores the files and puts each in the note: where a drop landed (`pos`), or at the caret. */
  take(files: File[], at?: { inline?: boolean; pos?: number }): boolean;
  /** Opens the viewer on the image node at `pos`, growing from `origin`. */
  open(pos: number, origin: HTMLElement): void;
}

/**
 * The bridge, and the way the pieces that do the work fill it in. `NoteEditor`
 * makes one per editor; the extension reads `bridge`, `NoteEditor` provides
 * `open`, and `ImageIntake` (only for a note that can take images) provides
 * `pick` and `take`. `provide` returns the way to take them back.
 */
export interface ImageLink {
  bridge: ImageBridge;
  provide(parts: Partial<ImageBridge>): () => void;
}

export function createImageLink(): ImageLink {
  const parts: Partial<ImageBridge> = {};
  return {
    bridge: {
      pick: (inline) => parts.pick?.(inline) ?? false,
      canPick: () => parts.canPick?.() ?? parts.pick !== undefined,
      take: (files, at) => parts.take?.(files, at) ?? false,
      open: (pos, origin) => void parts.open?.(pos, origin),
    },
    provide(given) {
      Object.assign(parts, given);
      return () => {
        for (const key of Object.keys(given) as (keyof ImageBridge)[])
          if (parts[key] === given[key]) delete parts[key];
      };
    },
  };
}

/** What a paste or a drop is read as: image files, to be stored. */
export function imageFiles(list: FileList | File[] | null | undefined): File[] {
  return list ? [...list] : [];
}
