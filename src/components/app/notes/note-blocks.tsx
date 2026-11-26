'use client';

// The part of the editor's blocks that needs the app around them: the dialogs
// a block asks for (a trade to link, a day to link, an equation, the address of
// a video or a post), the small offer a pasted YouTube or X address gets, and
// the clock a timed item is stamped from. `NoteEditor` mounts this for a note
// that can be edited and fills the blocks' bridge (`extensions/blocks-model`).
// The trade and day boxes read the workspace's trades and the profile, so they
// are there only under the app's data; the equation and embed boxes need none.
import { X } from '@phosphor-icons/react/dist/ssr';
import type { Editor } from '@tiptap/core';
import katex from 'katex';
import { Dialog } from 'radix-ui';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { usePrefs, useTrades } from '@/data/query/hooks';
import { useHasData } from '@/data/query/provider';
import { localDate } from '@/domain/time';
import { useDisplay } from '@/lib/display';
import { clock, dayLabel } from '@/lib/time-format';
import {
  createBlockLink,
  type BlockKind,
  type BlockLink,
  type BlockRequest,
  type EmbedOffer,
} from './extensions/blocks-model';
import { parseTweetUrl, parseYoutubeUrl } from './extensions/embed-urls';
import { isDate } from './extensions/link-chip';
import { insertBlock } from './extensions/insert-block';

export { createBlockLink };

const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// ---- the dialog shell ----------------------------------------------------------

const FIELD =
  'h-10 w-full rounded-control border border-line bg-surface-1 px-3 text-[14px] text-text outline-none placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11';

/**
 * A dialog of the editor's: a centred card on a wide screen, a full-height
 * sheet with its buttons fixed at the foot on a phone. Escape and the close
 * button leave it, and focus goes back to the note.
 */
function BlockDialog({
  editor,
  title,
  description,
  onClose,
  footer,
  children,
}: {
  editor: Editor;
  title: string;
  description?: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-veil" />
        <Dialog.Content
          {...(description ? {} : { 'aria-describedby': undefined })}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!editor.isDestroyed) editor.commands.focus();
          }}
          className="fixed inset-x-0 top-3 bottom-0 z-50 flex flex-col overflow-hidden rounded-card border border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[calc(100%-32px)] sm:max-w-[520px] motion-safe:data-[state=open]:animate-pop-in"
        >
          <div className="flex items-start gap-3 border-b border-line px-5 pt-[18px] pb-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[17px] leading-snug font-semibold tracking-[-0.015em] text-text">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[13px] leading-[1.5] text-muted">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-m-1.5 inline-flex size-11 flex-none items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>
          <div className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-1 px-5 py-3">
            {footer}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---- a trade to link -----------------------------------------------------------

const ROWS_SHOWN = 50;

function TradePicker({
  editor,
  at,
  onClose,
}: {
  editor: Editor;
  at: number;
  onClose: () => void;
}): React.JSX.Element {
  const trades = useTrades().data;
  const zone = usePrefs().data?.timeZone ?? browserZone();
  const display = useDisplay();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const rows = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return [...(trades ?? [])]
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .map((t) => ({ t, date: localDate(t.openedAt, zone) }))
      .filter(({ t, date }) => {
        if (terms.length === 0) return true;
        const hay =
          `${t.instrument.symbol} ${t.instrument.root} ${date} ${dayLabel(date)} ${t.serial} ${t.direction}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
      })
      .slice(0, ROWS_SHOWN);
  }, [trades, query, zone]);

  const pick = (id: string) => {
    editor
      .chain()
      .focus()
      .insertContentAt(Math.min(at, editor.state.doc.content.size), [
        { type: 'tradeLink', attrs: { tradeId: id } },
        { type: 'text', text: ' ' },
      ])
      .run();
    onClose();
  };
  const current = Math.min(active, Math.max(0, rows.length - 1));
  const optionId = (i: number) => `${listId}-${i}`;

  return (
    <BlockDialog
      editor={editor}
      title="Link a trade"
      description="Search by symbol, date or trade number."
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <input
        role="combobox"
        aria-label="Search trades"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={rows.length ? optionId(current) : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus
        value={query}
        placeholder="ES, 2026-11-24, 1229"
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (rows.length)
              setActive(
                (current + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) %
                  rows.length,
              );
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const row = rows[current];
            if (row) pick(row.t.id);
          }
        }}
        className={FIELD}
      />
      {trades === undefined ? (
        <p className="px-1 pt-3 text-[13px] text-faint">Loading trades.</p>
      ) : rows.length === 0 ? (
        <p className="px-1 pt-3 text-[13px] text-faint">
          {trades.length === 0 ? 'No trades yet.' : 'No trades match.'}
        </p>
      ) : (
        <ul
          role="listbox"
          id={listId}
          aria-label="Trades"
          className="mt-2 flex flex-col"
        >
          {rows.map(({ t, date }, i) => {
            const figure = display.ofTrade(t);
            const net = display.figure(figure);
            return (
              <li
                key={t.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === current}
                // Keep the field's focus: a click chooses, it does not move focus.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(t.id)}
                className={`flex cursor-pointer items-center gap-3 rounded-[8px] px-3 py-2 pointer-coarse:min-h-11 ${
                  i === current ? 'bg-sunken' : ''
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-text">
                    {t.instrument.symbol}{' '}
                    <span className="font-normal text-faint tabular-nums">
                      {t.serial}
                    </span>
                  </span>
                  <span className="block text-[12px] text-faint">
                    {dayLabel(date, { year: true })}
                    {' · '}
                    {t.direction === 'long' ? 'Long' : 'Short'}
                  </span>
                </span>
                {t.status === 'closed' ? (
                  <span
                    className={`flex-none text-[13px] font-medium tabular-nums ${
                      figure.money > 0
                        ? 'text-gain'
                        : figure.money < 0
                          ? 'text-loss'
                          : 'text-muted'
                    }`}
                    aria-label={net.label}
                  >
                    {net.text}
                  </span>
                ) : (
                  <span className="flex-none text-[12px] text-faint">Open</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </BlockDialog>
  );
}

// ---- a day to link -------------------------------------------------------------

function DayPicker({
  editor,
  at,
  onClose,
}: {
  editor: Editor;
  at: number;
  onClose: () => void;
}): React.JSX.Element {
  const zone = usePrefs().data?.timeZone ?? browserZone();
  const [picked, setPicked] = useState<string | null>(null);
  const today = localDate(new Date().toISOString(), zone);
  const date = picked ?? today;
  const ok = isDate(date);
  const inputId = useId();
  const pick = () => {
    if (!ok) return;
    editor
      .chain()
      .focus()
      .insertContentAt(Math.min(at, editor.state.doc.content.size), [
        { type: 'dayLink', attrs: { date } },
        { type: 'text', text: ' ' },
      ])
      .run();
    onClose();
  };
  return (
    <BlockDialog
      editor={editor}
      title="Link a day"
      description="The chip opens that day's page."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ok} onClick={pick}>
            Link day
          </Button>
        </>
      }
    >
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] text-muted">
        Day
      </label>
      <input
        id={inputId}
        type="date"
        value={date}
        autoFocus
        onChange={(e) => setPicked(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            pick();
          }
        }}
        className={`${FIELD} font-mono`}
      />
    </BlockDialog>
  );
}

// ---- an equation ---------------------------------------------------------------

function renderLatex(
  latex: string,
  displayMode: boolean,
): { html: string } | { error: true } {
  try {
    return {
      html: katex.renderToString(latex, {
        throwOnError: true,
        displayMode,
        maxExpand: 1000,
      }),
    };
  } catch {
    return { error: true };
  }
}

function EquationDialog({
  editor,
  request,
  onClose,
}: {
  editor: Editor;
  request: Extract<BlockRequest, { kind: 'equation' }>;
  onClose: () => void;
}): React.JSX.Element {
  const editing = request.node !== undefined;
  const [latex, setLatex] = useState(request.node?.latex ?? '');
  const [inline, setInline] = useState(request.inline);
  const fieldId = useId();
  const result = useMemo(
    () => (latex.trim() === '' ? null : renderLatex(latex, !inline)),
    [latex, inline],
  );
  const valid = result !== null && 'html' in result;

  const save = () => {
    if (!valid) return;
    const text = latex.trim();
    const chain = editor.chain().focus();
    if (request.node) {
      const { pos } = request.node;
      (request.inline
        ? chain.updateInlineMath({ latex: text, pos })
        : chain.updateBlockMath({ latex: text, pos })
      ).run();
    } else if (inline) {
      chain.insertInlineMath({ latex: text, pos: request.at }).run();
    } else {
      chain
        .command(({ tr, state }) => {
          const node = state.schema.nodes.blockMath?.create({ latex: text });
          return node
            ? insertBlock(tr, state.schema, request.at, node) !== null
            : false;
        })
        .run();
    }
    onClose();
  };
  const remove = () => {
    if (!request.node) return;
    const { pos } = request.node;
    const chain = editor.chain().focus();
    (request.inline
      ? chain.deleteInlineMath({ pos })
      : chain.deleteBlockMath({ pos })
    ).run();
    onClose();
  };

  return (
    <BlockDialog
      editor={editor}
      title={editing ? 'Edit equation' : 'Equation'}
      description="Write it as LaTeX, for example \frac{gain}{risk}."
      onClose={onClose}
      footer={
        <>
          {editing ? (
            <Button variant="ghost" className="mr-auto" onClick={remove}>
              Remove
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={save}>
            {editing ? 'Save' : 'Insert'}
          </Button>
        </>
      }
    >
      <label htmlFor={fieldId} className="mb-1.5 block text-[13px] text-muted">
        LaTeX
      </label>
      <textarea
        id={fieldId}
        value={latex}
        rows={3}
        autoFocus
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setLatex(e.target.value)}
        className={`${FIELD} h-auto min-h-[84px] resize-y py-2 font-mono text-[13.5px] leading-[1.5]`}
      />
      {!editing ? (
        <fieldset className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <legend className="sr-only">Where it goes</legend>
          {[
            [false, 'On its own line'],
            [true, 'In the text'],
          ].map(([value, label]) => (
            <label
              key={String(value)}
              className="flex items-center gap-2 text-[13.5px] text-text pointer-coarse:min-h-11"
            >
              <input
                type="radio"
                name={`${fieldId}-place`}
                checked={inline === value}
                onChange={() => setInline(value as boolean)}
                className="size-4 accent-[var(--accent)]"
              />
              {label as string}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div
        aria-live="polite"
        className="mt-4 flex min-h-[64px] items-center justify-center overflow-x-auto rounded-[10px] bg-sunken px-3 py-3 text-[15px]"
      >
        {result === null ? (
          <span className="text-[13px] text-faint">
            The equation shows here.
          </span>
        ) : 'html' in result ? (
          <span dangerouslySetInnerHTML={{ __html: result.html }} />
        ) : (
          <span className="text-[13px] text-loss">
            That isn&apos;t valid LaTeX yet.
          </span>
        )}
      </div>
    </BlockDialog>
  );
}

// ---- an address to embed -------------------------------------------------------

const EMBED_COPY = {
  youtube: {
    title: 'Embed a YouTube video',
    description:
      "It plays from youtube-nocookie.com while this note is open and you're online.",
    placeholder: 'https://www.youtube.com/watch?v=...',
    refusal: "That isn't the address of a YouTube video.",
  },
  tweet: {
    title: 'Embed a post from X',
    description:
      "X's own widget shows it while this note is open and you're online. Keel asks X for it only then.",
    placeholder: 'https://x.com/name/status/...',
    refusal: "That isn't the address of a post on X.",
  },
} as const;

/** Puts an embed block where `at` is: in place of an empty paragraph, else below the one it is in. */
export function putEmbed(
  editor: Editor,
  at: number,
  embed: 'youtube' | 'tweet',
  address: string,
): boolean {
  const video = embed === 'youtube' ? parseYoutubeUrl(address) : null;
  const post = embed === 'tweet' ? parseTweetUrl(address) : null;
  if (!video && !post) return false;
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const type = state.schema.nodes[embed];
      if (!type) return false;
      const node = video
        ? type.create({ src: video.src, start: video.start })
        : type.create({ url: post!.url });
      return insertBlock(tr, state.schema, at, node) !== null;
    })
    .run();
}

function EmbedDialog({
  editor,
  request,
  onClose,
}: {
  editor: Editor;
  request: Extract<BlockRequest, { kind: 'embed' }>;
  onClose: () => void;
}): React.JSX.Element {
  const copy = EMBED_COPY[request.embed];
  const [address, setAddress] = useState('');
  const [refused, setRefused] = useState(false);
  const fieldId = useId();
  const submit = () => {
    const at = Math.min(request.at, editor.state.doc.content.size);
    if (putEmbed(editor, at, request.embed, address)) onClose();
    else setRefused(true);
  };
  return (
    <BlockDialog
      editor={editor}
      title={copy.title}
      description={copy.description}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Embed</Button>
        </>
      }
    >
      <label htmlFor={fieldId} className="mb-1.5 block text-[13px] text-muted">
        Link
      </label>
      <input
        id={fieldId}
        type="text"
        inputMode="url"
        autoComplete="off"
        autoFocus
        value={address}
        placeholder={copy.placeholder}
        aria-invalid={refused || undefined}
        onChange={(e) => {
          setAddress(e.target.value);
          setRefused(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        className={FIELD}
      />
      {refused ? (
        <p role="alert" className="mt-2 text-[13px] text-loss">
          {copy.refusal}
        </p>
      ) : null}
    </BlockDialog>
  );
}

// ---- the offer a pasted address gets -------------------------------------------

function EmbedOfferBar({
  editor,
  offer,
  onDone,
}: {
  editor: Editor;
  offer: EmbedOffer;
  onDone: () => void;
}): React.JSX.Element {
  const youtube = offer.embed.kind === 'youtube';

  // The offer is for the link as pasted: any edit, or the caret leaving it, ends it.
  useEffect(() => {
    const onTransaction = ({
      transaction,
    }: {
      transaction: { docChanged: boolean };
    }) => {
      const { from } = editor.state.selection;
      if (transaction.docChanged || from < offer.from || from > offer.to)
        onDone();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDone();
    };
    editor.on('transaction', onTransaction);
    editor.view.dom.addEventListener('keydown', onKey);
    const dom = editor.view.dom;
    return () => {
      editor.off('transaction', onTransaction);
      dom.removeEventListener('keydown', onKey);
    };
  }, [editor, offer, onDone]);

  let rect: { left: number; bottom: number } | null = null;
  try {
    const c = editor.view.coordsAtPos(offer.from);
    rect = { left: c.left, bottom: c.bottom };
  } catch {
    rect = null;
  }
  const style: React.CSSProperties = rect
    ? {
        position: 'fixed',
        left: Math.max(
          8,
          Math.min(rect.left, (globalThis.innerWidth ?? 400) - 328),
        ),
        top: rect.bottom + 8,
      }
    : { position: 'fixed', left: 8, top: 120 };

  const embed = () => {
    const kind = offer.embed.kind;
    const address =
      offer.embed.kind === 'youtube' ? offer.embed.src : offer.embed.url;
    // The pasted link comes out, the embed goes in its place.
    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const type = state.schema.nodes[kind];
        if (!type) return false;
        const at = offer.from;
        tr.delete(offer.from, offer.to);
        const node =
          offer.embed.kind === 'youtube'
            ? type.create({ src: address, start: offer.embed.start })
            : type.create({ url: address });
        return insertBlock(tr, state.schema, at, node) !== null;
      })
      .run();
    onDone();
  };

  return (
    <div
      role="group"
      aria-label="Embed this link"
      style={style}
      className="z-50 flex w-[320px] max-w-[calc(100vw-16px)] flex-col gap-2 rounded-[12px] border border-line bg-surface-1 p-3 text-text shadow-[var(--shadow)]"
    >
      <p className="text-[13.5px] font-medium">
        {youtube ? 'Embed this YouTube video?' : 'Embed this post from X?'}
      </p>
      <p className="text-[12px] text-faint">
        {youtube
          ? 'It plays while this note is open and you are online.'
          : 'It shows while this note is open and you are online.'}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={embed}>
          Embed
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            onDone();
            editor.commands.focus();
          }}
        >
          Keep as link
        </Button>
      </div>
    </div>
  );
}

// ---- the whole --------------------------------------------------------------------

/** Gives the blocks the time in the profile's zone; there only under the app's data. */
function ProfileClock({ link }: { link: BlockLink }): null {
  const zone = usePrefs().data?.timeZone;
  useEffect(
    () =>
      link.provide({
        now: () =>
          clock(new Date().toISOString(), zone ?? browserZone(), false),
      }),
    [link, zone],
  );
  return null;
}

/**
 * Mounts the dialogs and the offer for one editor and tells its blocks how to
 * ask for them. For a note that can be edited; a note that cannot has none, so
 * its blocks ask for nothing.
 */
export function NoteBlocks({
  editor,
  link,
}: {
  editor: Editor;
  link: BlockLink;
}): React.JSX.Element {
  const hasData = useHasData();
  const [dialog, setDialog] = useState<BlockRequest | null>(null);
  const [offer, setOffer] = useState<EmbedOffer | null>(null);
  const hasDataRef = useRef(hasData);
  useEffect(() => {
    hasDataRef.current = hasData;
  });

  useEffect(() => {
    const can = (kind: BlockKind) =>
      kind === 'equation' || kind === 'embed' || hasDataRef.current;
    return link.provide({
      canAsk: can,
      ask: (request) => {
        if (!can(request.kind)) return false;
        setDialog(request);
        return true;
      },
      offer: (next) => {
        setOffer(next);
        return true;
      },
    });
  }, [link]);

  const close = () => setDialog(null);
  const clearOffer = useMemo(() => () => setOffer(null), []);
  return (
    <>
      {hasData ? <ProfileClock link={link} /> : null}
      {dialog?.kind === 'trade' && hasData ? (
        <TradePicker editor={editor} at={dialog.at} onClose={close} />
      ) : null}
      {dialog?.kind === 'day' && hasData ? (
        <DayPicker editor={editor} at={dialog.at} onClose={close} />
      ) : null}
      {dialog?.kind === 'equation' ? (
        <EquationDialog editor={editor} request={dialog} onClose={close} />
      ) : null}
      {dialog?.kind === 'embed' ? (
        <EmbedDialog editor={editor} request={dialog} onClose={close} />
      ) : null}
      {offer ? (
        <EmbedOfferBar editor={editor} offer={offer} onDone={clearOffer} />
      ) : null}
    </>
  );
}
