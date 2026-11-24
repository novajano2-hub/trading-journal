'use client';

import { useId } from 'react';
import { HELP, INPUT, LABEL } from '@/components/app/import/styles';
import { FieldError } from './settings-ui';

/**
 * Twelve colours for a tag category. Each hue has a job elsewhere in Keel, so
 * the palette leaves them out: gain green, loss red, the ultramarine accent and
 * info cyan, and the blends that sit beside them (teal, lime, a blue-leaning
 * rose). Marigold stays in, because Mistakes is marigold.
 */
export const SWATCHES: readonly { name: string; hex: string }[] = [
  { name: 'Marigold', hex: '#D97706' },
  { name: 'Clay', hex: '#A5562B' },
  { name: 'Rose', hex: '#CB4B8A' },
  { name: 'Orchid', hex: '#B547A8' },
  { name: 'Plum', hex: '#7E3F9E' },
  { name: 'Olive', hex: '#7D8A1E' },
  { name: 'Bronze', hex: '#8E6B21' },
  { name: 'Umber', hex: '#6E4B3A' },
  { name: 'Mauve', hex: '#A06A8E' },
  { name: 'Slate', hex: '#636889' },
  { name: 'Graphite', hex: '#3B405C' },
  { name: 'Sand', hex: '#A8946B' },
];

/** The swatch's name for a colour, or "Custom colour" for one typed in. */
export function swatchName(color: string): string {
  const hex = color.toUpperCase();
  return SWATCHES.find((s) => s.hex === hex)?.name ?? 'Custom colour';
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** The colour a hex field holds: `#RRGGBB` in capitals, or null. The `#` may be left off. */
export function parseHex(text: string): string | null {
  const t = text.trim();
  const full = /^[0-9A-Fa-f]{6}$/.test(t) ? `#${t}` : t;
  return HEX.test(full) ? full.toUpperCase() : null;
}

/**
 * A colour: twelve swatches and a hex field. `text` is what the field holds;
 * the owner reads the colour with `parseHex(text)`, null while it isn't one.
 */
export function ColourPicker({
  text,
  onChange,
}: {
  text: string;
  onChange(text: string): void;
}): React.JSX.Element {
  const name = useId();
  const hexId = useId();
  const current = parseHex(text);
  const invalid = text.trim() !== '' && current === null;
  return (
    <div>
      <span id={`${name}-label`} className={LABEL}>
        Colour
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${name}-label`}
        className="grid grid-cols-6 gap-2 sm:grid-cols-12"
      >
        {SWATCHES.map((s) => {
          const on = current === s.hex;
          return (
            <label
              key={s.name}
              title={s.name}
              className="relative grid size-8 cursor-pointer place-items-center rounded-[9px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent pointer-coarse:size-11"
            >
              <input
                type="radio"
                name={name}
                aria-label={s.name}
                checked={on}
                onChange={() => onChange(s.hex)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                style={{ backgroundColor: s.hex }}
                className={`size-6 rounded-[7px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] transition-transform duration-200 pointer-coarse:size-8 ${on ? 'scale-110 ring-2 ring-text ring-offset-2 ring-offset-surface-1' : ''}`}
              />
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-start gap-3">
        <span
          aria-hidden="true"
          style={{ backgroundColor: current ?? 'transparent' }}
          className="mt-0.5 size-7 flex-none rounded-[8px] border border-line-2"
        />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-text">
            {current ? swatchName(current) : 'Not a colour yet'}
          </p>
          <label htmlFor={hexId} className="mt-1.5 block text-xs text-faint">
            Hex
          </label>
          <input
            id={hexId}
            value={text}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={invalid || undefined}
            aria-describedby={`${hexId}-${invalid ? 'err' : 'help'}`}
            onChange={(e) => onChange(e.target.value)}
            className={`${INPUT} mt-1 w-[120px] font-mono uppercase`}
          />
          {invalid ? (
            <FieldError id={`${hexId}-err`}>
              Use six digits, like #1693BE.
            </FieldError>
          ) : (
            <p id={`${hexId}-help`} className={HELP}>
              Or type your own, as #RRGGBB.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
