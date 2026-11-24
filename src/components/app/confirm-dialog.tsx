'use client';

import { useId, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';

/** Thrown from `onConfirm` to say, in the dialog, exactly what happened. */
export class ConfirmFailure extends Error {}

/**
 * A small confirmation. Confirm runs `onConfirm`; the dialog stays open and
 * busy until it settles, then closes through `onClose`. A failure keeps the
 * dialog open with the reason, so nothing reads as done when it isn't.
 * With `requireText` the confirm button stays off until that text is typed
 * (compared exactly, ignoring surrounding spaces).
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  requireText,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  requireText?: string;
  onConfirm(): Promise<void>;
  onClose(): void;
}): React.JSX.Element {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const inputId = useId();

  // A reopened dialog starts clean.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped('');
      setFailed(null);
    }
  }

  const ready = requireText === undefined || typed.trim() === requireText;

  const confirm = async () => {
    setBusy(true);
    setFailed(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setFailed(
        e instanceof ConfirmFailure
          ? e.message
          : "Couldn't finish that. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-veil" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-line bg-surface-1 p-6 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=open]:animate-pop-in">
          <Dialog.Title className="text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance">
            {title}
          </Dialog.Title>
          <Dialog.Description asChild>
            <div className="mt-2 text-[14.5px] leading-[1.6] text-pretty text-muted">
              {body}
            </div>
          </Dialog.Description>
          {requireText !== undefined ? (
            <div className="mt-4">
              <label
                htmlFor={inputId}
                className="mb-1.5 block text-[13px] text-muted"
              >
                Type{' '}
                <span className="font-semibold text-text">{requireText}</span>{' '}
                to confirm
              </label>
              <input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="h-10 w-full rounded-control border border-line bg-surface-1 px-3 text-[14px] text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
              />
            </div>
          ) : null}
          {failed ? (
            <p role="alert" className="mt-3 text-[13px] text-loss">
              {failed}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!ready || busy}
              onClick={() => void confirm()}
              className={
                danger
                  ? '!bg-loss-fill !bg-none !text-white !shadow-none hover:!opacity-90'
                  : ''
              }
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
