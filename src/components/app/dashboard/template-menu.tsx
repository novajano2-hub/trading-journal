'use client';

import { Check, Layout } from '@phosphor-icons/react/dist/ssr';
import { useId, useState } from 'react';
import { Popover } from 'radix-ui';
import { usePrefs } from '@/data/query/hooks';
import { templatesOf } from '@/domain/dashboard/templates';

const PANEL =
  'z-50 w-[260px] max-w-[calc(100vw-24px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

/**
 * The top bar's icon button, 34px with the search beside it (a plain 44px
 * glyph on a phone, where the bar has no boxes).
 */
const TRIGGER =
  'inline-flex size-[34px] flex-none items-center justify-center rounded-control border border-line bg-surface-1 text-muted transition-[border-color,color] duration-200 ease-(--ease-glide) hover:border-accent/35 hover:text-text disabled:opacity-60 data-[state=open]:border-accent/35 data-[state=open]:text-text pointer-coarse:size-11 max-sm:size-11 max-sm:border-transparent max-sm:bg-transparent max-sm:data-[state=open]:bg-sunken';

/**
 * The dashboard's template button: an icon named for the template in use
 * ("Dashboard template: Main"), which opens the list of the user's
 * templates with the one in use marked. Read-only for now: choosing, editing
 * and creating come with the template menu.
 */
export function TemplateMenu(): React.JSX.Element {
  const prefs = usePrefs().data;
  const [open, setOpen] = useState(false);
  const labelId = useId();

  // No name to give until the prefs say which template is in use.
  if (!prefs)
    return (
      <button
        type="button"
        disabled
        aria-label="Dashboard template"
        title="Dashboard template"
        className={TRIGGER}
      >
        <Layout size={18} aria-hidden="true" />
      </button>
    );

  const { inUse, all } = templatesOf(prefs);
  const label = `Dashboard template: ${inUse.name}`;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger aria-label={label} title={label} className={TRIGGER}>
        <Layout size={18} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label="Dashboard templates"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={PANEL}
        >
          <p id={labelId} className="px-2.5 pt-2 pb-1 text-xs text-faint">
            Templates
          </p>
          <ul aria-labelledby={labelId} className="m-0 list-none p-0">
            {all.map((t) => {
              const current = t.id === inUse.id;
              return (
                <li
                  key={t.id}
                  aria-current={current ? 'true' : undefined}
                  className="flex h-10 items-center gap-2.5 rounded-[8px] pr-2.5 pl-2.5 text-[14px] font-medium"
                >
                  <span className="flex w-4 flex-none justify-center text-accent-ink">
                    {current ? <Check size={16} aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 truncate">{t.name}</span>
                  {current ? <span className="sr-only">In use</span> : null}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
