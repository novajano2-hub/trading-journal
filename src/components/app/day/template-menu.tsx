'use client';

import { DropdownMenu } from 'radix-ui';
import { useTemplates } from '@/data/query/hooks';
import { KEEL_DAILY_IDS } from '@/data/seed/templates';
import type { NoteTemplate } from '@/domain/types';

const MENU =
  'z-[60] min-w-[220px] origin-(--radix-dropdown-menu-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';
const ITEM =
  'flex min-h-9 cursor-pointer items-center rounded-[8px] px-2.5 text-[13.5px] outline-none data-[highlighted]:bg-sunken pointer-coarse:min-h-11';
const GROUP = 'px-2.5 pt-1.5 pb-1 text-[12px] font-medium text-faint';

/**
 * The daily templates a day note can take: yours, then the built-in ones
 * (the Daily review and Keel's three) as "Recommended". With `manage`, See
 * more templates, Manage templates and Edit default follow. `trigger` is the
 * one button that opens it.
 */
export function TemplateMenu({
  trigger,
  onPick,
  manage,
  onOpenChange,
}: {
  trigger: React.ReactElement;
  onPick(template: NoteTemplate): void;
  manage?: { onManage(): void; onEditDefault(): void };
  onOpenChange?(open: boolean): void;
}): React.JSX.Element {
  const daily = (useTemplates().data ?? []).filter(
    (t) => t.kind === 'daily-review',
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
    <DropdownMenu.Root onOpenChange={onOpenChange}>
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
