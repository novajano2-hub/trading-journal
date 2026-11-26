'use client';

import { DotsThree, X } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { Dialog, DropdownMenu } from 'radix-ui';
import { Fragment, useRef, type ReactNode } from 'react';

/** Table header and cell looks shared by the settings tables (the comp's 46px rows). */
export const TH =
  'h-10 px-1.5 text-left text-[12px] font-medium whitespace-nowrap text-faint first:pl-5 last:pr-5';
export const TD =
  'h-[46px] px-1.5 align-middle first:pl-5 last:pr-5 border-t border-line';
export const NUM = 'text-right tabular-nums';

const MENU =
  'z-[60] min-w-[180px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const MENU_ITEM =
  'flex min-h-9 cursor-pointer items-center rounded-[8px] px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken pointer-coarse:min-h-11';

export interface MenuAction {
  label: string;
  /** Not needed for a link. */
  onSelect?(): void;
  /** A link: the item navigates instead of running `onSelect`. */
  href?: string;
  /** A glyph before the label, decorative. */
  icon?: ReactNode;
  /** A rule above it, setting it apart from the actions before. */
  separated?: boolean;
  /** Destructive: loss ink. */
  danger?: boolean;
  /** Runs once the menu has closed, in place of returning focus to its button (to move it to a card, say). */
  afterClose?(): void;
}

/** A row's "..." menu: a 28px button (44px on touch) that opens its actions. */
export function RowMenu({
  label,
  actions,
}: {
  /** What the trigger is called, e.g. "Actions for Futures live". */
  label: string;
  actions: readonly MenuAction[];
}): React.JSX.Element {
  const after = useRef<(() => void) | null>(null);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className="inline-grid size-7 place-items-center rounded-[8px] border border-line text-muted outline-offset-2 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
      >
        <DotsThree size={16} weight="bold" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className={MENU}
          onCloseAutoFocus={(e) => {
            const run = after.current;
            after.current = null;
            if (!run) return;
            e.preventDefault();
            run();
          }}
        >
          {actions.map((a) => {
            const className = `${MENU_ITEM} ${a.icon ? 'gap-2.5' : ''} ${a.danger ? 'text-loss' : ''}`;
            const content = (
              <>
                {a.icon ? (
                  <span
                    aria-hidden="true"
                    className={`flex-none ${a.danger ? '' : 'text-muted'}`}
                  >
                    {a.icon}
                  </span>
                ) : null}
                {a.label}
              </>
            );
            return (
              <Fragment key={a.label}>
                {a.separated ? (
                  <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />
                ) : null}
                {a.href !== undefined ? (
                  <DropdownMenu.Item asChild>
                    <Link href={a.href} className={`${className} no-underline`}>
                      {content}
                    </Link>
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item
                    className={className}
                    onSelect={() => {
                      after.current = a.afterClose ?? null;
                      a.onSelect?.();
                    }}
                  >
                    {content}
                  </DropdownMenu.Item>
                )}
              </Fragment>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * A dialog for a form or a list: a title, a line under it, a close button.
 * `wide` for a table inside it.
 */
export function SettingsDialog({
  open,
  onClose,
  title,
  description,
  wide = false,
  children,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  description?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-veil" />
        <Dialog.Content
          className={`fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] ${wide ? 'w-[min(680px,calc(100vw-32px))]' : 'w-[min(480px,calc(100vw-32px))]'} -translate-x-1/2 -translate-y-1/2 flex-col rounded-[16px] border border-line bg-surface-1 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=open]:animate-pop-in`}
        >
          <div className="flex items-start gap-3 px-6 pt-5">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[17px] leading-snug font-semibold tracking-[-0.015em] text-balance">
                {title}
              </Dialog.Title>
              <Dialog.Description asChild>
                <div className="mt-1 text-[13.5px] leading-snug text-muted">
                  {description ?? <span className="sr-only">{title}</span>}
                </div>
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mt-1 -mr-2 grid size-8 flex-none place-items-center rounded-[8px] text-faint outline-offset-0 hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11"
            >
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-6 pt-4 pb-6">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Moves focus to the field with this id: the first invalid one after a refused submit. */
export function focusField(id: string): void {
  document.getElementById(id)?.focus();
}

/** A red line under a field, announced when it appears. Point the field's `aria-describedby` at its `id`. */
export function FieldError({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 text-[12.5px] font-medium text-loss"
    >
      {children}
    </p>
  );
}
