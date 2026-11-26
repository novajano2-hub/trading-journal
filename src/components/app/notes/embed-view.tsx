'use client';

// How a YouTube video and a post from X draw in a note (spec §5.6, B42, the
// owner's decision U4). Nothing outside is asked for until the node is on the
// screen and the browser is online: the video plays from the privacy-enhanced
// domain; X's widget script is added to the page when a post's node mounts, and
// only then. Offline, while a post loads, if it fails, and in a note laid out
// for print, the plain link is what shows. Under every embed, where it comes
// from.
import { LinkSimple } from '@phosphor-icons/react/dist/ssr';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  parseTweetUrl,
  youtubeEmbedSrc,
  youtubeWatchSrc,
} from './extensions/embed-urls';

/** `links`: an embed is only its link, whatever the browser's state (a print or export layout). */
export type EmbedPolicy = 'live' | 'links';
export const EmbedPolicyContext = createContext<EmbedPolicy>('live');

function subscribe(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

/** Whether the browser says it is online. A server render assumes it is. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

// ---- X's widget script -------------------------------------------------------

const WIDGETS_SRC = 'https://platform.twitter.com/widgets.js';
const WIDGETS_TIMEOUT_MS = 15_000;

interface Widgets {
  createTweet(
    id: string,
    container: HTMLElement,
    options?: Record<string, unknown>,
  ): Promise<HTMLElement | undefined>;
}
type TwitterWindow = Window & {
  twttr?: { widgets?: Widgets; ready?: (cb: () => void) => void };
};

let widgetsLoading: Promise<Widgets> | null = null;

/** For tests: forget a load that is in flight or done, so the next mount asks again. */
export function resetTwitterWidgets(): void {
  widgetsLoading = null;
}

/**
 * Adds X's widget script to the page, once, and resolves with its widgets.
 * Called only from a post's node when it mounts online; a failure is forgotten
 * so the next mount can try again.
 */
export function loadTwitterWidgets(): Promise<Widgets> {
  const w = window as TwitterWindow;
  if (w.twttr?.widgets) return Promise.resolve(w.twttr.widgets);
  if (widgetsLoading) return widgetsLoading;
  const attempt = new Promise<Widgets>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = (why: string) => {
      script.remove();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('timeout'), WIDGETS_TIMEOUT_MS);
    script.src = WIDGETS_SRC;
    script.async = true;
    script.charset = 'utf-8';
    script.onload = () => {
      clearTimeout(timer);
      const done = () => {
        const widgets = w.twttr?.widgets;
        if (widgets) resolve(widgets);
        else fail('no widgets');
      };
      if (typeof w.twttr?.ready === 'function') w.twttr.ready(done);
      else done();
    };
    script.onerror = () => {
      clearTimeout(timer);
      fail('load');
    };
    document.head.appendChild(script);
  });
  widgetsLoading = attempt;
  attempt.catch(() => {
    if (widgetsLoading === attempt) widgetsLoading = null;
  });
  return attempt;
}

// ---- the views ---------------------------------------------------------------

function EmbedLink({
  href,
  hidden = false,
  children,
}: {
  href: string;
  /** Out of sight on the screen but still in a print layout. */
  hidden?: boolean;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <p className="note-embed-link" hidden={hidden}>
      <LinkSimple size={14} aria-hidden="true" />
      <a href={href} target="_blank" rel="noopener noreferrer">
        {href}
      </a>
      {children}
    </p>
  );
}

export function YoutubeView({
  node,
  selected,
}: NodeViewProps): React.JSX.Element {
  const policy = useContext(EmbedPolicyContext);
  const online = useOnline();
  const start = Number(node.attrs.start) || 0;
  const embed = youtubeEmbedSrc(node.attrs.src, start);
  const watch = youtubeWatchSrc(node.attrs.src, start);
  const live = policy === 'live' && online && embed !== null;
  return (
    <NodeViewWrapper
      data-embed="youtube"
      data-selected={selected || undefined}
      className="note-embed"
    >
      {live ? (
        <div className="note-embed-frame">
          <iframe
            src={embed}
            title="YouTube video"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      ) : null}
      {watch !== null ? (
        <EmbedLink href={watch} hidden={live} />
      ) : (
        <p className="note-embed-link">
          This video address can&apos;t be read.
        </p>
      )}
      {!live && watch !== null && policy === 'live' ? (
        <p className="note-embed-note">
          {online
            ? "This video can't be shown."
            : "You're offline. The video plays when you're back online."}
        </p>
      ) : null}
      <p className="note-embed-source">From youtube.com</p>
    </NodeViewWrapper>
  );
}

type Drawn = { id: string; status: 'ready' | 'failed' };

export function TweetView({
  node,
  selected,
}: NodeViewProps): React.JSX.Element {
  const policy = useContext(EmbedPolicyContext);
  const online = useOnline();
  const post = parseTweetUrl(String(node.attrs.url ?? ''));
  const host = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const id = post?.id;
  const live = policy === 'live' && online && id !== undefined;

  useEffect(() => {
    const container = host.current;
    if (!live || !container || id === undefined) return;
    let cancelled = false;
    const theme =
      document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    loadTwitterWidgets()
      .then((widgets) =>
        widgets.createTweet(id, container, {
          dnt: true,
          theme,
          conversation: 'none',
          align: 'left',
        }),
      )
      .then(
        (el) => {
          if (cancelled) el?.remove();
          else setDrawn({ id, status: el ? 'ready' : 'failed' });
        },
        () => {
          if (!cancelled) setDrawn({ id, status: 'failed' });
        },
      );
    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [live, id]);

  const status = live && drawn?.id === id ? drawn.status : null;
  const ready = status === 'ready';
  const url = post?.url ?? String(node.attrs.url ?? '');
  return (
    <NodeViewWrapper
      data-embed="tweet"
      data-selected={selected || undefined}
      className="note-embed"
    >
      <div
        ref={host}
        className="note-embed-widget"
        data-ready={ready || undefined}
      />
      {post ? (
        <EmbedLink href={url} hidden={ready} />
      ) : (
        <p className="note-embed-link">This post address can&apos;t be read.</p>
      )}
      {post && policy === 'live' && !ready ? (
        <p
          className="note-embed-note"
          role={status === 'failed' ? 'status' : undefined}
        >
          {!online
            ? "You're offline. The post shows when you're back online."
            : status === 'failed'
              ? "Couldn't load the post."
              : 'Loading the post from x.com.'}
        </p>
      ) : null}
      <p className="note-embed-source">From x.com</p>
    </NodeViewWrapper>
  );
}
