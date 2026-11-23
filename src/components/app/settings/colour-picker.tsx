'use client';

import { useId } from 'react';
import { HELP, INPUT, LABEL } from '@/components/app/import/styles';
import { FieldError } from './settings-ui';

type Rgb = readonly [number, number, number];

/** The app's own colours (theme.css), as the fills they give charts and tiles. */
const TOKEN = {
  accent: [0x2b, 0x35, 0xaf],
  accentDark: [0x4c, 0x57, 0xdc],
  info: [0x16, 0x93, 0xbe],
  gain: [0x19, 0xa6, 0x72],
  warn: [0xe9, 0xa2, 0x1a],
  loss: [0xe5, 0x48, 0x4d],
  faint: [0x63, 0x68, 0x89],
} as const satisfies Record<string, Rgb>;

const hex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** `t` of the way from `a` to `b`. */
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Twelve colours for a tag category: the theme's accent, gain, warning, loss
 * and info fills, and the steps between neighbours, from blue round to rose.
 */
export const SWATCHES: readonly { name: string; hex: string }[] = [
  { name: 'Ultramarine', hex: hex(TOKEN.accent) },
  { name: 'Periwinkle', hex: hex(TOKEN.accentDark) },
  { name: 'Cyan', hex: hex(TOKEN.info) },
  { name: 'Teal', hex: hex(mix(TOKEN.info, TOKEN.gain, 0.5)) },
  { name: 'Green', hex: hex(TOKEN.gain) },
  { name: 'Lime', hex: hex(mix(TOKEN.gain, TOKEN.warn, 0.5)) },
  { name: 'Amber', hex: hex(TOKEN.warn) },
  { name: 'Orange', hex: hex(mix(TOKEN.warn, TOKEN.loss, 0.5)) },
  { name: 'Red', hex: hex(TOKEN.loss) },
  { name: 'Rose', hex: hex(mix(TOKEN.loss, TOKEN.accent, 0.35)) },
  { name: 'Plum', hex: hex(mix(TOKEN.loss, TOKEN.accent, 0.65)) },
  { name: 'Slate', hex: hex(TOKEN.faint) },
];

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
          className="mt-[3px] size-7 flex-none rounded-[8px] border border-line-2"
        />
        <div className="min-w-0">
          <label htmlFor={hexId} className="sr-only">
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
            className={`${INPUT} w-[120px] font-mono uppercase`}
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
