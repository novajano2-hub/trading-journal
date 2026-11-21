'use client';

// Technique adapted from HorizonX Expanding Search, commercial licence: the
// field that grows as it takes focus. Restyled to Keel's tokens (sunken fill, 1px line,
// cobalt focus ring). The gradient, drop shadow and hover width are dropped:
// at rest it is a 36px icon button, and it widens over `glide` on focus,
// staying put under reduced motion. Added: an ARIA combobox and its listbox.
import { MagnifyingGlass } from '@phosphor-icons/react/dist/ssr';
import { useId, useState, type Ref } from 'react';

export interface SearchOption {
  id: string;
  label: string;
  detail?: string;
}

/**
 * Wide enough for the longest option, and never past the bar's left edge: on a
 * phone it stops short of the screen's, and from `sm` to `md` (where the
 * field sits furthest left) it is capped so its ring keeps a gutter.
 */
const EXPANDED =
  'data-[open=true]:w-[min(280px,calc(100vw-8.5rem))] sm:max-md:data-[open=true]:w-[248px]';

/**
 * The search field and its results. At rest only the magnifier shows; it
 * expands over the top bar while focused. The expansion is an overlay, so the
 * bar's layout never moves. Keys: ArrowDown/ArrowUp move through the results,
 * Enter picks one, Escape clears the query and calls `onClose`.
 */
export function ExpandingSearch({
  label,
  placeholder,
  shortcutHint,
  query,
  onQueryChange,
  results,
  onSelect,
  onClose,
  inputRef,
}: {
  label: string;
  placeholder: string;
  shortcutHint: string | null;
  query: string;
  onQueryChange(q: string): void;
  results: readonly SearchOption[];
  onSelect(id: string): void;
  /** Escape: hand focus back to where it came from. */
  onClose?(): void;
  inputRef?: Ref<HTMLInputElement>;
}): React.JSX.Element {
  const uid = useId();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const open = focused && results.length > 0;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const current = open && active >= 0 && active < results.length ? active : -1;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) =>
        i < 0
          ? step === 1
            ? 0
            : results.length - 1
          : (i + step + results.length) % results.length,
      );
    } else if (e.key === 'Enter') {
      const picked = results[current];
      if (picked) {
        e.preventDefault();
        onSelect(picked.id);
        setActive(-1);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onQueryChange('');
      setActive(-1);
      onClose?.();
    }
  }

  return (
    <div className="relative h-9 w-9 flex-none pointer-coarse:h-11 pointer-coarse:w-11">
      <div
        data-open={focused}
        className={`absolute top-0 right-0 z-10 w-full transition-[width] duration-[var(--dur-glide)] ease-[var(--ease-glide)] motion-reduce:transition-none ${EXPANDED}`}
      >
        <div className="relative h-9 overflow-hidden rounded-control border border-line bg-sunken transition-colors hover:border-line-2 focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-accent pointer-coarse:h-11">
          <MagnifyingGlass
            size={18}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-[8px] -translate-y-1/2 text-muted pointer-coarse:left-[12px]"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={`${uid}-list`}
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setActive(-1);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            className="h-full w-full cursor-pointer bg-transparent pr-14 pl-9 text-[13px] text-text outline-none placeholder:text-faint focus:cursor-text pointer-coarse:pl-11"
          />
          {focused && query === '' && shortcutHint ? (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-chip border border-line bg-surface-1 px-1.5 py-0.5 font-sans text-[11px] text-faint"
            >
              {shortcutHint}
            </kbd>
          ) : null}
        </div>
        <ul
          id={`${uid}-list`}
          role="listbox"
          aria-label={`${label} results`}
          hidden={!open}
          className="mt-1.5 overflow-hidden rounded-control border border-line bg-surface-1 py-1 shadow-[var(--shadow-chip)]"
        >
          {results.map((r, i) => (
            <li
              key={r.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === current}
              // Keep focus in the field: a pick must not blur it first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(r.id)}
              onMouseMove={() => setActive(i)}
              className={`flex h-9 cursor-pointer items-center justify-between gap-3 px-3 text-[13px] text-text ${i === current ? 'bg-sunken' : ''} pointer-coarse:h-11`}
            >
              <span className="truncate">{r.label}</span>
              {r.detail ? (
                <span className="flex-none text-[12px] text-faint">
                  {r.detail}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
