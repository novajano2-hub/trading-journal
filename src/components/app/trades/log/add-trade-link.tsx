import { Plus } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button-styles';

/** Add trade: the trade log's own link, to the manual entry form. */
export function AddTradeLink({
  className = '',
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <Link
      href="/app/trades/new"
      className={`${buttonClasses('secondary')} gap-1.5 ${className}`}
    >
      <Plus size={14} weight="bold" aria-hidden="true" />
      Add trade
    </Link>
  );
}
