'use client';

import { useIsMutating } from '@tanstack/react-query';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useId } from 'react';
import { Segmented } from '@/components/ui/segmented';
import { usePrefs, useUpdatePrefs } from '@/data/query/hooks';
import type { Appearance } from '@/domain/types';
import { applyAppearance } from '@/lib/appearance';

export const APPEARANCE_OPTIONS: readonly {
  value: Appearance;
  label: string;
}[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * The Appearance choice, saved in the prefs (System until one is made). A
 * choice shows at once: the page switches before the save lands.
 */
export function useAppearance(): {
  mode: Appearance;
  setMode(mode: Appearance): void;
} {
  const prefs = usePrefs().data;
  const update = useUpdatePrefs();
  const pending = update.isPending ? update.variables?.appearance : undefined;
  const mode = pending ?? prefs?.appearance ?? 'system';
  return {
    mode,
    setMode(next) {
      applyAppearance(next);
      update.mutate({ appearance: next });
    },
  };
}

/**
 * Keeps the page on the saved choice. The pre-paint script starts from its
 * mirrored copy; once the prefs load (or another tab changes them) they win.
 * While a write is in flight the page already shows the new choice, so a
 * read from before it never pulls the page back.
 */
export function AppearanceSync(): null {
  const saved = usePrefs().data;
  const writing = useIsMutating() > 0;
  const mode = saved ? (saved.appearance ?? 'system') : undefined;
  useEffect(() => {
    if (mode && !writing) applyAppearance(mode);
  }, [mode, writing]);
  return null;
}

/** System, Light and Dark as a segmented control: Settings, Profile and the phone's More sheet. */
export function AppearanceControl({
  label = 'Appearance',
  className = '',
}: {
  label?: string;
  className?: string;
}): React.JSX.Element {
  const { mode, setMode } = useAppearance();
  return (
    <Segmented
      label={label}
      options={APPEARANCE_OPTIONS}
      value={mode}
      onChange={setMode}
      coarseTargets
      className={className}
    />
  );
}

/** The same choice as a radio group inside a Radix dropdown menu: the desktop workspace menu. */
export function AppearanceMenuGroup({
  itemClassName,
  labelClassName,
  indicator,
}: {
  itemClassName: string;
  labelClassName: string;
  indicator: React.ReactNode;
}): React.JSX.Element {
  const { mode, setMode } = useAppearance();
  const labelId = useId();
  return (
    <DropdownMenu.RadioGroup
      aria-labelledby={labelId}
      value={mode}
      onValueChange={(v) => setMode(v as Appearance)}
    >
      <DropdownMenu.Label id={labelId} className={labelClassName}>
        Appearance
      </DropdownMenu.Label>
      {APPEARANCE_OPTIONS.map((o) => (
        <DropdownMenu.RadioItem
          key={o.value}
          value={o.value}
          // The menu stays open, so the choice can be seen taking effect.
          onSelect={(e) => e.preventDefault()}
          className={itemClassName}
        >
          {indicator}
          {o.label}
        </DropdownMenu.RadioItem>
      ))}
    </DropdownMenu.RadioGroup>
  );
}
