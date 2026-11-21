'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';

const KEY = 'keel-theme';

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => obs.disconnect();
}

const read = () =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/**
 * Explicit light/dark switch: a 34px white control with a hairline edge that
 * takes the accent on hover. Persists in localStorage; light is the default.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, () => 'light');
  const next = theme === 'dark' ? 'light' : 'dark';

  function toggle() {
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // storage can be blocked; the choice just won't persist
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      className={`inline-flex size-[34px] items-center justify-center rounded-control border border-line bg-surface-1 text-muted transition-[border-color,color] duration-200 ease-(--ease-glide) hover:border-accent/35 hover:text-text pointer-coarse:size-11 ${className}`}
    >
      {theme === 'dark' ? (
        <Sun size={18} aria-hidden="true" />
      ) : (
        <Moon size={18} aria-hidden="true" />
      )}
    </button>
  );
}
