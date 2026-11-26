'use client';

import { DropdownMenu } from 'radix-ui';
import { useTemplates } from '@/data/query/hooks';
import { KEEL_DAILY_IDS } from '@/data/seed/templates';
import type { JournalKind, NoteTemplate } from '@/domain/types';

const MENU =
  'z-[60] min-w-[220px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
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
 */
export function TemplateMenu({
  trigger,
  onPick,
  manage,
  open,
  onOpenChange,
  kind = 'daily-review',
}: {
  trigger: React.ReactElement;
  onPick(template: NoteTemplate): void;
  manage?: { onManage(): void; onEditDefault(): void };
  open?: boolean;
  onOpenChange?(open: boolean): void;
  kind?: JournalKind | 'all';
}): React.JSX.Element {
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
      <DropdownMenu.Item key={t.id} className={ITEM} onSelect={() => onPick(t)}>
        {t.name}
      </DropdownMenu.Item>
    ));
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={MENU}>
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
              <DropdownMenu.Item className={ITEM} onSelect={manage.onManage}>
                See more templates
              </DropdownMenu.Item>
              <DropdownMenu.Item className={ITEM} onSelect={manage.onManage}>
                Manage templates
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={ITEM}
                onSelect={manage.onEditDefault}
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
