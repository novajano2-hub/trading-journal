// What a pasted or typed address is, for an embed (spec §5.6, U4): a YouTube
// video or a post on X. Pure, so the paste handler, the dialogs, the nodes and
// their views read addresses one way. An address that is not exactly one of
// these (a lookalike host, a sentence with a link in it) is not an embed.

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const X_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);
const VIDEO_ID = /^[\w-]{11}$/;
const POST_PATH =
  /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})(?:\/.*)?$/;

export interface YoutubeEmbed {
  kind: 'youtube';
  id: string;
  /** The address a note stores: always the watch address, whatever was pasted. */
  src: string;
  /** Seconds in at which it starts; 0 from the beginning. */
  start: number;
}
export interface TweetEmbed {
  kind: 'tweet';
  id: string;
  user: string;
  /** The address a note stores: always `https://x.com/<user>/status/<id>`. */
  url: string;
}
export type Embed = YoutubeEmbed | TweetEmbed;

/** One address and nothing else: no spaces, an http or https scheme. */
function addressOf(text: string): URL | null {
  const t = text.trim();
  if (t === '' || /\s/.test(t)) return null;
  try {
    const url = new URL(t);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** "90", "90s", "1m30s", "1h2m3s" as seconds; 0 for anything else. */
function secondsOf(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return Number(value);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!m || (!m[1] && !m[2] && !m[3])) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function parseYoutubeUrl(text: string): YoutubeEmbed | null {
  const url = addressOf(text);
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  let id: string | undefined;
  if (url.hostname.toLowerCase() === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else {
    const path = /^\/(?:embed|shorts|live|v)\/([\w-]+)/.exec(url.pathname);
    id =
      path?.[1] ??
      (url.pathname === '/watch'
        ? (url.searchParams.get('v') ?? undefined)
        : undefined);
  }
  if (id === undefined || !VIDEO_ID.test(id)) return null;
  const start = secondsOf(
    url.searchParams.get('t') ?? url.searchParams.get('start'),
  );
  return {
    kind: 'youtube',
    id,
    src: `https://www.youtube.com/watch?v=${id}`,
    start,
  };
}

export function parseTweetUrl(
  text: string,
): { id: string; user: string; url: string } | null {
  const url = addressOf(text);
  if (!url || !X_HOSTS.has(url.hostname.toLowerCase())) return null;
  const m = POST_PATH.exec(url.pathname);
  if (!m) return null;
  const [, user, id] = m;
  return { id: id!, user: user!, url: `https://x.com/${user}/status/${id}` };
}

/** What an address is, if it is an embed. */
export function parseEmbedUrl(text: string): Embed | null {
  const video = parseYoutubeUrl(text);
  if (video) return video;
  const post = parseTweetUrl(text);
  return post ? { kind: 'tweet', ...post } : null;
}

/**
 * The address a video plays from: always the privacy-enhanced domain, whatever
 * a note's stored address says. Null when the address is not a video.
 */
export function youtubeEmbedSrc(src: unknown, start = 0): string | null {
  const video = typeof src === 'string' ? parseYoutubeUrl(src) : null;
  if (!video) return null;
  const at = start > 0 ? start : video.start;
  return `https://www.youtube-nocookie.com/embed/${video.id}${at > 0 ? `?start=${Math.floor(at)}` : ''}`;
}

/** The address of the video's own page, for the link an embed falls back to. */
export function youtubeWatchSrc(src: unknown, start = 0): string | null {
  const video = typeof src === 'string' ? parseYoutubeUrl(src) : null;
  if (!video) return null;
  const at = start > 0 ? start : video.start;
  return `${video.src}${at > 0 ? `&t=${Math.floor(at)}s` : ''}`;
}
