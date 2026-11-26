'use client';

import {
  Check,
  Layout,
  PencilSimple,
  Plus,
} from '@phosphor-icons/react/dist/ssr';
import { useId, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { useChangeDashboards, usePrefs } from '@/data/query/hooks';
import {
  templatesOf,
  withInUse,
  withNewTemplate,
} from '@/domain/dashboard/templates';
import { NAME_LIMIT, useDashboardEdit } from './edit-session';

/**
 * The menu: a panel under the button, and on a phone as wide as the screen
 * (comp 01), its rows 44px.
 */
const PANEL =
  'z-50 w-[280px] max-w-[calc(100vw-16px)] origin-(--radix-popover-content-transform-origin) rounded-[12px] border border-line bg-surface-1 p-1.5 text-text shadow-[var(--shadow)] outline-none max-sm:w-[calc(100vw-16px)] motion-safe:data-[state=closed]:animate-tip-out motion-safe:data-[state=open]:animate-pop-in';

/**
 * The top bar's icon button, 34px with the search beside it (a plain 44px
 * glyph on a phone, where the bar has no boxes).
 */
const TRIGGER =
  'inline-flex size-[34px] flex-none items-center justify-center rounded-control border border-line bg-surface-1 text-muted transition-[border-color,color] duration-200 ease-(--ease-glide) hover:border-accent/35 hover:text-text disabled:opacity-60 data-[state=open]:border-accent/35 data-[state=open]:text-text pointer-coarse:size-11 max-sm:size-11 max-sm:border-transparent max-sm:bg-transparent max-sm:data-[state=open]:bg-sunken';

const ROW =
  'flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[8px] pr-2.5 pl-2.5 text-left text-[14px] font-medium hover:bg-sunken focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 max-sm:h-11';

const EDIT =
  'inline-flex size-[30px] flex-none items-center justify-center rounded-[7px] text-muted hover:bg-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:size-11 max-sm:size-11';

/** The new template's name: the one in use, and "copy", kept to the limit. */
const suggestion = (name: string) => `${name} copy`.slice(0, NAME_LIMIT);

/**
 * The name form of New template (C2), in the menu where the button was. A
 * blank name is refused in words; Enter creates.
 */
function NewTemplate({
  from,
  onCreate,
  onCancel,
}: {
  from: string;
  onCreate(name: string): void;
  onCancel(): void;
}): React.JSX.Element {
  const [name, setName] = useState(() => suggestion(from));
  const [blank, setBlank] = useState(false);
  const fieldId = useId();
  const errorId = useId();
  return (
    <form
      className="flex flex-col gap-2 px-2.5 pt-2 pb-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed.length < 1) setBlank(true);
        else onCreate(trimmed);
      }}
    >
      <label htmlFor={fieldId} className="text-[13px] text-muted">
        Name the new template
      </label>
      <input
        id={fieldId}
        autoFocus
        value={name}
        maxLength={NAME_LIMIT}
        autoComplete="off"
        aria-invalid={blank || undefined}
        aria-describedby={blank ? errorId : undefined}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          setName(e.target.value);
          setBlank(false);
        }}
        className="h-[34px] w-full rounded-control border border-line bg-surface-1 px-3 text-[14px] font-semibold text-text focus-visible:outline-2 focus-visible:outline-accent aria-invalid:border-loss pointer-coarse:h-11 max-sm:h-11"
      />
      {blank ? (
        <p id={errorId} role="alert" className="text-[13px] text-loss">
          Name the template, up to {NAME_LIMIT} characters.
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Create
        </Button>
      </div>
    </form>
  );
}

/**
 * The dashboard's template button: an icon named for the template in use
 * ("Dashboard template: Main"), which opens the user's templates with the one
 * in use checked. Picking one switches to it at once; its pencil opens edit
 * mode on it; New template asks a name and starts as a copy of the one in use
 * (C2). With no edit session around it (a page without edit mode) the list is
 * only for picking.
 */
export function TemplateMenu(): React.JSX.Element {
  const prefs = usePrefs().data;
  const edit = useDashboardEdit();
  const change = useChangeDashboards();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  // Edit mode takes the top bar: the button is gone, so focus has nowhere to return to.
  const handOver = useRef(false);
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
  const close = () => {
    setOpen(false);
    setNaming(false);
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setNaming(false);
      }}
    >
      <Popover.Trigger
        ref={edit?.anchor}
        aria-label={label}
        title={label}
        className={TRIGGER}
      >
        <Layout size={18} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label="Dashboard templates"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className={PANEL}
          onCloseAutoFocus={(e) => {
            if (handOver.current) {
              handOver.current = false;
              e.preventDefault();
            }
          }}
        >
          <p id={labelId} className="px-2.5 pt-2 pb-1 text-xs text-faint">
            Templates
          </p>
          <ul aria-labelledby={labelId} className="m-0 list-none p-0">
            {all.map((t) => {
              const current = t.id === inUse.id;
              return (
                <li key={t.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-current={current ? 'true' : undefined}
                    onClick={() => {
                      if (!current)
                        change.mutate((now) => withInUse(now, t.id));
                      close();
                    }}
                    className={ROW}
                  >
                    <span className="flex w-4 flex-none justify-center text-accent-ink">
                      {current ? <Check size={16} aria-hidden="true" /> : null}
                    </span>
                    <span className="min-w-0 truncate">{t.name}</span>
                    {current ? <span className="sr-only">In use</span> : null}
                  </button>
                  {edit ? (
                    <button
                      type="button"
                      aria-label={`Edit ${t.name}`}
                      title="Edit"
                      onClick={() => {
                        handOver.current = true;
                        close();
                        edit.begin(t);
                      }}
                      className={EDIT}
                    >
                      <PencilSimple size={15} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {edit ? (
            <>
              <hr className="mx-1 my-1.5 border-0 border-t border-line" />
              {naming ? (
                <NewTemplate
                  from={inUse.name}
                  onCancel={() => setNaming(false)}
                  onCreate={(name) => {
                    handOver.current = true;
                    close();
                    // The copy is stored at once, in use; arranging it is the edit that follows.
                    let id = '';
                    change.mutate(
                      (now) => {
                        const made = withNewTemplate(now, name);
                        id = made.created.id;
                        return made.dashboards;
                      },
                      {
                        onSuccess: (saved) => {
                          const made = saved.dashboards?.templates.find(
                            (t) => t.id === id,
                          );
                          if (made) edit.begin(made);
                        },
                      },
                    );
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setNaming(true)}
                  className={`${ROW} w-full flex-none font-semibold text-accent-ink`}
                >
                  <Plus size={16} aria-hidden="true" className="flex-none" />
                  New template
                </button>
              )}
            </>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
