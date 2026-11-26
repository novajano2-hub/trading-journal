// Emoji (spec §5.6, B34): ":" opens a search, and the pick goes in as an emoji
// node (its shortcode is what the note stores, so the note reads the same
// wherever the font has the glyph). Tiptap's emoji data is used with its
// fallback pictures taken out: those point at a CDN, and Keel asks no outside
// server for a picture; a glyph the system lacks shows as its own character.
import {
  Emoji,
  emojis as allEmojis,
  type EmojiItem,
} from '@tiptap/extension-emoji';
import { suggestionRender, type MenuBridge } from './suggestion-render';

export type { EmojiItem };

export const EMOJIS: EmojiItem[] = allEmojis
  .filter((e) => e.emoji && !e.name.startsWith('regional_indicator'))
  .map((e) => {
    const rest = { ...e };
    delete rest.fallbackImage;
    return rest;
  });

/** What the menu shows before anything is typed. */
const STARTERS = [
  'thumbsup',
  'white_check_mark',
  'x',
  'warning',
  'chart_with_upwards_trend',
  'chart_with_downwards_trend',
  'dart',
  'fire',
];

const byName = new Map(EMOJIS.map((e) => [e.name, e]));
const startersList = (): EmojiItem[] =>
  STARTERS.flatMap((n) => {
    const hit = byName.get(n) ?? EMOJIS.find((e) => e.shortcodes.includes(n));
    return hit ? [hit] : [];
  });

export const MAX_EMOJI = 8;

/** The emoji whose name, shortcode or tag the query is part of, the closest names first. */
export function searchEmoji(query: string): EmojiItem[] {
  const q = query.trim().toLowerCase().replace(/^:/, '');
  if (q === '') return startersList();
  const scored: [number, EmojiItem][] = [];
  for (const e of EMOJIS) {
    const names = [e.name, ...e.shortcodes];
    let score = 0;
    if (names.some((n) => n === q)) score = 4;
    else if (names.some((n) => n.startsWith(q))) score = 3;
    else if (names.some((n) => n.includes(q))) score = 2;
    else if (e.tags.some((t) => t.startsWith(q))) score = 1;
    if (score > 0) scored.push([score, e]);
  }
  return scored
    .sort((a, b) => b[0] - a[0])
    .slice(0, MAX_EMOJI)
    .map(([, e]) => e);
}

/** The name the menu shows beside the glyph. */
export const emojiLabel = (e: EmojiItem): string => e.shortcodes[0] ?? e.name;

export function createEmoji(menu: () => MenuBridge<EmojiItem> | undefined) {
  return Emoji.configure({
    emojis: EMOJIS,
    enableEmoticons: false,
    suggestion: {
      items: ({ query }) => searchEmoji(query),
      render: suggestionRender<EmojiItem>(menu),
    },
  });
}
