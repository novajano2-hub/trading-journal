// What the editor's blocks say to the app around them: the time to stamp a
// timed item with, the dialogs a block asks for (a trade or day to link, an
// equation, an address to embed) and the small offer a pasted link gets. The
// extensions read the bridge; `NoteEditor` fills it in. Pure, so every piece
// imports it.
import type { Embed } from './embed-urls';

/** A dialog a block can ask the host for. `at` is where the block goes. */
export type BlockRequest =
  | { kind: 'trade'; at: number }
  | { kind: 'day'; at: number }
  | {
      kind: 'equation';
      at: number;
      /** In the line of text (true) or on its own line. */
      inline: boolean;
      /** Set when an equation already in the note is being edited. */
      node?: { pos: number; latex: string };
    }
  | { kind: 'embed'; embed: 'youtube' | 'tweet'; at: number };

export type BlockKind = BlockRequest['kind'];

/** A pasted address that could be an embed, left in the note as a link until it is answered. */
export interface EmbedOffer {
  embed: Embed;
  /** The link's range in the note. */
  from: number;
  to: number;
}

export interface BlockBridge {
  /** The time now as HH:MM in the profile's time zone: what a new timed item starts with. */
  now(): string;
  /** Asks the host for a dialog. False: this note has none (it cannot be edited). */
  ask(request: BlockRequest): boolean;
  /** Whether the host has a dialog for the block, so a menu can leave out what it cannot do. */
  canAsk(kind: BlockKind): boolean;
  /** Offers to embed a pasted address. False: nobody is listening, and the paste is the editor's. */
  offer(offer: EmbedOffer): boolean;
}

export interface BlockLink {
  bridge: BlockBridge;
  provide(parts: Partial<BlockBridge>): () => void;
}

const two = (n: number) => String(n).padStart(2, '0');

/** The browser's own clock, for a note with no profile around it. */
const localNow = () => {
  const d = new Date();
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

/**
 * One per editor. Each answer is the host's if it has given one, and
 * otherwise "no" (the time is the browser's own).
 */
export function createBlockLink(): BlockLink {
  const parts: Partial<BlockBridge> = {};
  return {
    bridge: {
      now: () => parts.now?.() ?? localNow(),
      ask: (request) => parts.ask?.(request) ?? false,
      canAsk: (kind) => parts.canAsk?.(kind) ?? false,
      offer: (offer) => parts.offer?.(offer) ?? false,
    },
    provide(given) {
      Object.assign(parts, given);
      return () => {
        for (const key of Object.keys(given) as (keyof BlockBridge)[])
          if (parts[key] === given[key]) delete parts[key];
      };
    },
  };
}

/** A time as the box takes it ("9:41", "941", "09:41") to HH:MM, or null when it is not a time of day. */
export function normalTime(text: string): string | null {
  const m = /^\s*(\d{1,2})(?::?(\d{2}))\s*$/.exec(text);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${two(h)}:${two(min)}` : null;
}
