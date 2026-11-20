'use client';

// Original implementation of the WAI-ARIA accordion pattern: a button inside
// each heading with aria-expanded and aria-controls, a labelled region per
// panel, Enter/Space to toggle, one open section at a time, closed content
// inert. Motion timing follows the HorizonX animated-accordion spec (240 ms
// enter, 180 ms exit), animated through grid-template-rows; reduced motion
// changes it in 0 ms.
import { useId, useState, type ReactNode } from 'react';
import { Plus } from '@phosphor-icons/react/dist/ssr';
import { enter, exit } from '@/lib/motion';

export interface AccordionItem {
  value: string;
  title: string;
  content: ReactNode;
}

const curve = (e: readonly number[]) => `cubic-bezier(${e.join(',')})`;

export function Accordion({
  items,
  defaultValue,
  headingLevel = 3,
}: {
  items: readonly AccordionItem[];
  defaultValue?: string;
  headingLevel?: 2 | 3 | 4;
}) {
  const base = useId();
  const [open, setOpen] = useState<string | undefined>(defaultValue);
  const Heading = `h${headingLevel}` as const;

  return (
    <div className="border-b border-line">
      {items.map((item) => {
        const isOpen = open === item.value;
        const buttonId = `${base}-${item.value}-button`;
        const panelId = `${base}-${item.value}-panel`;
        const t = isOpen ? enter : exit;
        return (
          <div key={item.value} className="border-t border-line">
            <Heading className="m-0 text-[17px] font-medium">
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? undefined : item.value)}
                className="group flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left text-[17px] font-medium hover:text-accent-ink"
              >
                <span className="min-w-0">{item.title}</span>
                <Plus
                  size={18}
                  aria-hidden="true"
                  className={`shrink-0 text-faint transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-45' : ''}`}
                  style={{
                    transitionDuration: `${t.duration * 1000}ms`,
                    transitionTimingFunction: curve(t.ease),
                  }}
                />
              </button>
            </Heading>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!isOpen}
              className={`grid transition-[grid-template-rows] motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              style={{
                transitionDuration: `${t.duration * 1000}ms`,
                transitionTimingFunction: curve(t.ease),
              }}
            >
              <div className="overflow-hidden">
                <div className="pb-5 text-[15px] leading-[1.6] text-muted">
                  {item.content}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
