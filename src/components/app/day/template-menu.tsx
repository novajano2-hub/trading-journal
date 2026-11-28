'use client';

import { useRef } from 'react';
import { DropdownMenu } from 'radix-ui';
import { useTemplates } from '@/data/query/hooks';
import { KEEL_DAILY_IDS } from '@/data/seed/templates';
import type { JournalKind, NoteTemplate } from '@/domain/types';

const MENU =
  'z-[60] min-w-[220px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none data-[state=closed]:pointer-events-none! motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const ITEM =
  'flex min-h-9 cursor-pointer items-center rounded-[8px] px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken pointer-coarse:min-h-11';
const GROUP = 'px-2.5 pt-1.5 pb-1 text-[12px] font-medium text-faint';

/**
 * The templates a note can take (the daily ones for a day note; `kind` asks
 * for another kind's, or `all` for every kind: a plain note can take any):
 * yours, then the built-in ones (the Daily review and
 * Keel's three) as "Recommended". With `manage`, See more templates, Manage
 * templates and Edit default follow. `trigger` is the one button that opens
 * it; `open` is for a menu that is opened from another control (a phone's More
 * sheet), and leaves the menu uncontrolled when it is not given.
 * `onCloseAutoFocus` is told, as the menu goes, whether a template was picked:
 * the host that draws it in an editor's toolbar uses it to keep the keyboard in
 * the text instead of letting Radix return it to the trigger. It and
 * `onOpenChange` are also told when a manage item was chosen (`away`): that
 * opens a dialog of its own, which takes the keyboard, so nothing should hand
 * it back.
 */
export function TemplateMenu({
  trigger,
  onPick,
  manage,
  open,
  onOpenChange,
  onCloseAutoFocus,
  kind = 'daily-review',
}: {
  trigger: React.ReactElement;
  onPick(template: NoteTemplate): void;
  manage?: { onManage(): void; onEditDefault(): void };
  open?: boolean;
  onOpenChange?(open: boolean, away?: boolean): void;
  onCloseAutoFocus?(event: Event, picked: boolean, away?: boolean): void;
  kind?: JournalKind | 'all';
}): React.JSX.Element {
  const picked = useRef(false);
  // A manage item was chosen: its dialog has the keyboard now.
  const away = useRef(false);
  const leave = (run: () => void) => () => {
    away.current = true;
    run();
  };
  const daily = (useTemplates().data ?? []).filter(
    (t) => kind === 'all' || t.kind === kind,
  );
  const own = daily.filter((t) => !t.builtIn);
  const builtIn = [
    ...daily.filter(
      (t) => t.builtIn && !(KEEL_DAILY_IDS as readonly string[]).includes(t.id),
    ),
    ...KEEL_DAILY_IDS.flatMap((id) => daily.filter((t) => t.id === id)),
  ];
  const items = (list: readonly NoteTemplate[]) =>
    list.map((t) => (
      <DropdownMenu.Item
        key={t.id}
        className={ITEM}
        onSelect={() => {
          picked.current = true;
          onPick(t);
        }}
      >
        {t.name}
      </DropdownMenu.Item>
    ));
  return (
    <DropdownMenu.Root
      open={open}
      onOpenChange={(next) => {
        if (next) away.current = false;
        onOpenChange?.(next, away.current);
      }}
    >
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={MENU}
          onCloseAutoFocus={(event) => {
            const was = picked.current;
            const left = away.current;
            picked.current = false;
            away.current = false;
            onCloseAutoFocus?.(event, was, left);
          }}
        >
          {own.length > 0 ? (
            <>
              <DropdownMenu.Label className={GROUP}>
                Your templates
              </DropdownMenu.Label>
              {items(own)}
            </>
          ) : null}
          <DropdownMenu.Label className={GROUP}>Recommended</DropdownMenu.Label>
          {items(builtIn)}
          {manage ? (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              {/* TradeZella's "see more templates" opens its template library; Keel has none, so (Keel's mapping) it opens Manage templates. */}
              <DropdownMenu.Item
                className={ITEM}
                onSelect={leave(manage.onManage)}
              >
                See more templates
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={ITEM}
                onSelect={leave(manage.onManage)}
              >
                Manage templates
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={ITEM}
                onSelect={leave(manage.onEditDefault)}
              >
                Edit default
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
