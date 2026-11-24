import type { Icon } from '@phosphor-icons/react';

/**
 * The one glyph an empty, error or drop state may carry: plain, regular
 * weight, 28px, in faint ink, with nothing behind it. Decorative: the words
 * under it say what happened.
 */
export function StateGlyph({
  icon: Glyph,
  className = '',
}: {
  icon: Icon;
  className?: string;
}): React.JSX.Element {
  return (
    <Glyph
      size={28}
      weight="regular"
      aria-hidden="true"
      className={`flex-none text-faint ${className}`}
    />
  );
}
