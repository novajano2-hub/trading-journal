'use client';

import { Plus } from '@phosphor-icons/react/dist/ssr';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { MorphDialog } from '@/components/ui/morph-dialog';
import { WIDGET_BLURBS, WIDGET_TITLES } from '@/content/dashboard-widgets';
import { missingFrom, UPPER_LIMIT } from '@/domain/dashboard/templates';
import type { WidgetSection } from '@/domain/dashboard/widgets';
import type { DashTemplate, WidgetKey } from '@/domain/types';

/**
 * Add a widget (C6): the widgets of one section that are not on the template,
 * each with its one line and an Add button. A widget already placed is never
 * listed, so each appears once. The list stays open after an Add, so several
 * can go in; when the upper section reaches five, the rest are greyed and
 * say why.
 */
export function WidgetPicker({
  section,
  template,
  origin,
  returnFocus,
  onAdd,
  onClose,
}: {
  section: WidgetSection;
  /** The draft: what is on it decides what is listed. */
  template: DashTemplate;
  origin: RefObject<HTMLElement | null>;
  returnFocus: RefObject<HTMLElement | null>;
  onAdd(key: WidgetKey): void;
  onClose(): void;
}): React.JSX.Element {
  const keys = missingFrom(template, section);
  const full = section === 'upper' && template.upper.length >= UPPER_LIMIT;
  const list = useRef<HTMLUListElement>(null);
  const [added, setAdded] = useState<string>();

  // The Add that was pressed goes with its row: focus moves to the next one still on.
  const count = keys.length;
  const wasAdded = useRef(false);
  useEffect(() => {
    if (!wasAdded.current) return;
    wasAdded.current = false;
    list.current
      ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      ?.focus();
  }, [count]);

  return (
    <MorphDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      origin={origin}
      returnFocus={returnFocus}
      title="Add a widget"
      description={`For the ${section} section. Widgets already on this template aren't listed.`}
      size="list"
    >
      <p role="status" className="sr-only">
        {added}
      </p>
      {full ? (
        <p className="mt-2 rounded-[10px] bg-sunken px-4 py-2.5 text-[13px] text-muted">
          The upper section is full.
        </p>
      ) : null}
      {keys.length === 0 ? (
        <p className="py-6 text-[14px] text-muted">
          Every widget for this section is already on the template.
        </p>
      ) : (
        <ul ref={list} className="m-0 list-none p-0">
          {keys.map((key) => (
            <li
              key={key}
              className="flex items-start gap-3 border-t border-line/70 py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <b className="block text-[14px] font-semibold">
                  {WIDGET_TITLES[key]}
                </b>
                <small className="mt-0.5 block text-[12.5px] leading-[1.45] whitespace-normal text-muted">
                  {WIDGET_BLURBS[key]}
                </small>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={full}
                aria-label={`Add ${WIDGET_TITLES[key]}`}
                onClick={() => {
                  wasAdded.current = true;
                  setAdded(`Added ${WIDGET_TITLES[key]}.`);
                  onAdd(key);
                }}
              >
                <Plus size={15} aria-hidden="true" />
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </MorphDialog>
  );
}
