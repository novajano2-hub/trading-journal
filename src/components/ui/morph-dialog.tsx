'use client';

// Technique adapted from HorizonX Morph Dialog, commercial licence: the
// shared-element morph, where a card grows into its dialog and closes back into
// it. Rebuilt on Radix Dialog as a FLIP from the opener's rect (open over
// `glide`, close over `exit`); under reduced motion only opacity changes. The
// looks, images, eyebrow, blur and spring are dropped.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Dialog } from 'radix-ui';
import { animate, useReducedMotion } from 'motion/react';
import { X } from '@phosphor-icons/react/dist/ssr';
import { exit, glide } from '@/lib/motion';

/** Transform that places the panel exactly over `from`. */
function flipFrom(from: DOMRect, panel: DOMRect) {
  return {
    x: from.left + from.width / 2 - (panel.left + panel.width / 2),
    y: from.top + from.height / 2 - (panel.top + panel.height / 2),
    scaleX: from.width / panel.width,
    scaleY: from.height / panel.height,
  };
}

/**
 * A dialog that grows out of the element that opened it (`origin`) and returns
 * to it. Traps focus, closes on Escape or the close button, and hands focus
 * to `returnFocus`.
 */
export function MorphDialog({
  open,
  onOpenChange,
  origin,
  returnFocus,
  title,
  description,
  icon,
  actions,
  size = 'default',
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  origin: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  title: string;
  description?: ReactNode;
  /** A decorative tile beside the title, as the card it grew from has. */
  icon?: ReactNode;
  /** Controls in the header between the title and the close button (a menu, a star). */
  actions?: ReactNode;
  /** `full` fills the screen inside a small gutter, for a chart or a table that wants the room. `sheet` is the default size on a wide screen and a full-height sheet on a phone. `medium` is the comps' 600px dialog: the same full-height sheet on a phone. `compact` is a narrow choice list (480px) that stays a small dialog on a phone. */
  size?: 'default' | 'full' | 'sheet' | 'medium' | 'compact';
  /** Pinned under the scrolling body, never inside it. */
  footer?: ReactNode;
  children: ReactNode;
}): React.JSX.Element | null {
  const reduced = useReducedMotion();
  // The sheet breathes a little more on a wide screen (comp 02).
  const sheet = size === 'sheet' || size === 'medium';
  const gutter = sheet ? 'px-5 sm:px-6' : 'px-5';
  // Stays mounted while the exit plays, after `open` has already gone false.
  const [present, setPresent] = useState(open);
  const veil = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const exiting = useRef<{ stop: () => void }[]>([]);

  if (open && !present) setPresent(true);

  useLayoutEffect(() => {
    if (!open || !present) return;
    const panelEl = panel.current;
    const veilEl = veil.current;
    const bodyEl = body.current;
    if (!panelEl || !veilEl || !bodyEl) return;
    // A reopen can land mid-exit: stop it and clear its leftovers so the
    // measurement below sees the panel at rest, not mid-transform.
    exiting.current.forEach((c) => c.stop());
    exiting.current = [];
    panelEl.style.transform = 'none';
    panelEl.style.opacity = '';
    bodyEl.style.opacity = '';
    const opts = { duration: glide.duration, ease: glide.ease };
    const fade = animate(veilEl, { opacity: [0, 1] }, opts);
    if (reduced) {
      const f = animate(panelEl, { opacity: [0, 1] }, opts);
      return () => {
        fade.stop();
        f.stop();
      };
    }
    const from = origin.current?.getBoundingClientRect();
    const rect = panelEl.getBoundingClientRect();
    if (!from || !rect.width || !rect.height) {
      bodyEl.style.opacity = '1';
      return () => fade.stop();
    }
    const t = flipFrom(from, rect);
    const grow = animate(
      panelEl,
      {
        x: [t.x, 0],
        y: [t.y, 0],
        scaleX: [t.scaleX, 1],
        scaleY: [t.scaleY, 1],
      },
      opts,
    );
    // The rows arrive once the shape is mostly there, so text is never squashed.
    const content = animate(
      bodyEl,
      { opacity: [0, 1] },
      { ...opts, delay: 0.1 },
    );
    return () => {
      fade.stop();
      grow.stop();
      content.stop();
    };
  }, [open, present, origin, reduced]);

  useEffect(() => {
    if (open || !present) return;
    const panelEl = panel.current;
    const veilEl = veil.current;
    const bodyEl = body.current;
    let cancelled = false;
    const done = () => {
      if (!cancelled) setPresent(false);
    };
    if (!panelEl || !veilEl || !bodyEl) {
      done();
      return;
    }
    const opts = { duration: exit.duration, ease: exit.ease };
    const from = origin.current?.getBoundingClientRect();
    const rect = panelEl.getBoundingClientRect();
    const fade = animate(veilEl, { opacity: 0 }, opts);
    const controls: { stop: () => void }[] = [fade];
    let main;
    if (reduced || !from || !rect.width) {
      main = animate(panelEl, { opacity: 0 }, opts);
    } else {
      const t = flipFrom(from, rect);
      controls.push(
        animate(
          bodyEl,
          { opacity: 0 },
          { ...opts, duration: exit.duration / 2 },
        ),
      );
      main = animate(panelEl, t, opts);
    }
    controls.push(main);
    exiting.current = controls;
    Promise.all([main, fade]).then(done, done);
    return () => {
      cancelled = true;
      controls.forEach((c) => c.stop());
    };
  }, [open, present, origin, reduced]);

  if (!present) return null;

  return (
    <Dialog.Root open={present} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay ref={veil} className="fixed inset-0 z-50 bg-veil" />
        <Dialog.Content
          ref={panel}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          className={`fixed z-50 flex flex-col overflow-hidden rounded-card border border-line bg-surface-1 shadow-[var(--shadow)] outline-none ${
            size === 'full'
              ? 'inset-3 sm:inset-6'
              : sheet
                ? `inset-x-0 top-3 bottom-0 max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 sm:inset-0 sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[calc(100%-32px)] ${size === 'medium' ? 'sm:max-w-[600px]' : 'sm:max-w-[760px]'}`
                : size === 'compact'
                  ? 'inset-0 m-auto h-fit max-h-[80dvh] w-[calc(100%-32px)] max-w-[480px]'
                  : 'inset-0 m-auto h-fit max-h-[80dvh] w-[calc(100%-32px)] max-w-[760px]'
          }`}
        >
          <div
            ref={body}
            className={`flex min-h-0 flex-col ${size === 'full' ? 'h-full' : sheet ? 'h-full sm:h-auto sm:max-h-[80dvh]' : 'max-h-[80dvh]'}`}
          >
            <div
              className={`flex items-start gap-3 border-b border-line ${gutter} pt-[18px] pb-4`}
            >
              {icon ? <div className="flex-none pt-px">{icon}</div> : null}
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-[17px] leading-snug font-semibold tracking-[-0.015em] text-pretty text-text">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description asChild>
                    <div className="mt-1 text-[13px] leading-[1.5] text-muted">
                      {description}
                    </div>
                  </Dialog.Description>
                ) : null}
              </div>
              {actions ? (
                <div className="flex flex-none items-center gap-0.5">
                  {actions}
                </div>
              ) : null}
              <Dialog.Close
                aria-label="Close"
                className="-m-1.5 inline-flex size-11 flex-none items-center justify-center rounded-control text-muted transition-colors duration-200 ease-[var(--ease-glide)] hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
              >
                <X size={18} aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div
              className={`min-h-0 flex-1 overflow-y-auto ${gutter} pt-2 pb-4`}
            >
              {children}
            </div>
            {footer ? (
              <div
                className={`flex-none border-t border-line bg-surface-1 ${gutter} py-3`}
              >
                {footer}
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
