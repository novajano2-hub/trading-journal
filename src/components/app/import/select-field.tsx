import { CaretDown } from '@phosphor-icons/react/dist/ssr';
import type { ComponentProps } from 'react';
import { INPUT } from './styles';

/** A native select in the import's field look, with its own caret. */
export function SelectField({
  className = '',
  children,
  ...props
}: ComponentProps<'select'>) {
  return (
    <span className="relative block">
      <select
        {...props}
        className={`${INPUT} appearance-none pr-8 ${className}`}
      >
        {children}
      </select>
      <CaretDown
        aria-hidden="true"
        size={14}
        weight="bold"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-faint"
      />
    </span>
  );
}
