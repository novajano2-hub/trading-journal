'use client';

import { Globe } from '@phosphor-icons/react/dist/ssr';
import { useId, useState } from 'react';
import { isValidTimeZone } from '@/domain/time';
import { offsetLabel, zoneLabel } from '@/lib/time-zone-label';
import { INPUT } from './styles';

let zones: string[] | undefined;

/** Every IANA zone the browser knows, UTC first. */
export function timeZoneNames(): string[] {
  if (zones) return zones;
  try {
    const all = Intl.supportedValuesOf('timeZone');
    zones = all.includes('UTC') ? all : ['UTC', ...all];
  } catch {
    zones = ['UTC'];
  }
  return zones;
}

export { offsetLabel };

/**
 * A zone picked by typing: the browser filters its list of every zone as you
 * type. Only a real zone reaches `onChange`; leaving the field with anything
 * else puts the last good one back.
 */
export function TimeZoneField({
  label,
  value,
  onChange,
  describedBy,
}: {
  label: string;
  value: string;
  onChange: (timeZone: string) => void;
  describedBy?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? value;
  const invalid = draft !== null && !isValidTimeZone(draft);
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium text-muted"
      >
        {label}
      </label>
      <div className="relative">
        <Globe
          aria-hidden="true"
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <input
          id={id}
          list={`${id}-zones`}
          value={text}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-offset${describedBy ? ` ${describedBy}` : ''}`}
          onChange={(e) => {
            setDraft(e.target.value);
            if (isValidTimeZone(e.target.value)) onChange(e.target.value);
          }}
          onBlur={() => setDraft(null)}
          className={`${INPUT} pl-9`}
        />
        <datalist id={`${id}-zones`}>
          {timeZoneNames().map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </div>
      <p
        id={`${id}-offset`}
        className="mt-1.5 text-[12px] leading-snug text-faint"
      >
        {invalid
          ? "Keel doesn't know that time zone. Pick one from the list, like America/Chicago."
          : `${zoneLabel(value)} now. Keel stores UTC and shows your own time zone.`}
      </p>
    </div>
  );
}
