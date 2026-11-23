'use client';

import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { CaretDown, CaretUp } from '@phosphor-icons/react/dist/ssr';
import { useMemo, useState, type ReactNode } from 'react';
import { MetricTip } from '@/components/ui/metric-tip';
import type { MetricId } from '@/content/metric-definitions';
import type { PnlBasis } from '@/domain/types';
import { plural } from '@/lib/format';

export type { SortingState };

const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
});

const PAGE_SIZE = 50;

/** One column of a summary table. */
export interface SummaryColumn<Row extends object> {
  /** Also the id `initialSort` names. */
  id: string;
  header: string;
  /** The header is this metric's label, with its definition. */
  tip?: MetricId;
  align?: 'left' | 'right';
  /** What the column sorts on; null or undefined sorts last. */
  value(row: Row): string | number | null | undefined;
  /** What the cell shows; default: the sort value. */
  cell?(row: Row): ReactNode;
  /** A number's first click sorts the largest first; set false to start from the smallest. */
  descFirst?: boolean;
}

function compare(a: string | number, b: string | number): number {
  return typeof a === 'string' && typeof b === 'string'
    ? a.localeCompare(b)
    : Number(a) - Number(b);
}

function columnsOf<Row extends object>(
  specs: readonly SummaryColumn<Row>[],
): ColumnDef<typeof features, Row>[] {
  const helper = createColumnHelper<typeof features, Row>();
  return specs.map(
    (c) =>
      helper.accessor((row) => c.value(row) ?? undefined, {
        id: c.id,
        header: c.header,
        cell: (info) =>
          c.cell
            ? c.cell(info.row.original)
            : (c.value(info.row.original) ?? ''),
        sortFn: (a, b) => {
          const x = a.getValue<string | number | undefined>(c.id);
          const y = b.getValue<string | number | undefined>(c.id);
          if (x === undefined || y === undefined) return 0;
          return compare(x, y);
        },
        sortUndefined: 'last',
        sortDescFirst: c.descFirst ?? c.align === 'right',
      }) as unknown as ColumnDef<typeof features, Row>,
  );
}

function SortButton({
  label,
  sorted,
  onClick,
  named,
  right,
}: {
  label: string;
  sorted: false | 'asc' | 'desc';
  onClick: ((event: unknown) => void) | undefined;
  /** The label is the button's visible text. */
  named: boolean;
  right: boolean;
}): React.JSX.Element {
  const Mark = sorted === 'asc' ? CaretUp : CaretDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={named ? undefined : `Sort by ${label}`}
      className={`group/sort inline-flex h-7 items-center gap-1 rounded-chip font-medium text-faint outline-offset-0 hover:text-text focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 ${named ? '-mx-1.5 px-1.5' : 'px-1'} ${right ? 'flex-row-reverse' : ''}`}
    >
      {named ? label : null}
      <Mark
        size={11}
        weight="bold"
        aria-hidden="true"
        className={`flex-none transition-opacity duration-200 ${sorted ? 'text-text' : 'opacity-0 group-hover/sort:opacity-60'}`}
      />
    </button>
  );
}

/**
 * A sortable table of one row per period, symbol, tag and so on. Each header
 * with a metric carries its definition and a sort button; the table is a real
 * `<table>` with `aria-sort`, paged at 50 rows. Rows keep the order they come
 * in until a header is pressed.
 */
export function SummaryTable<Row extends object>({
  rows,
  columns,
  label,
  initialSort = [],
  basis,
}: {
  rows: readonly Row[];
  columns: readonly SummaryColumn<Row>[];
  label: string;
  initialSort?: SortingState;
  /** The P&L basis the metric definitions read. */
  basis: PnlBasis;
}): React.JSX.Element {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });
  const defs = useMemo(() => columnsOf(columns), [columns]);
  const align = new Map(columns.map((c) => [c.id, c.align ?? 'left']));
  const tips = new Map(columns.map((c) => [c.id, c.tip]));
  const table = useTable({
    features,
    columns: defs,
    data: rows as Row[],
    state: { sorting, pagination },
    onSortingChange: (next) => {
      setSorting(next);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    enableSortingRemoval: false,
  });
  const page = table.getRowModel().rows;
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : pagination.pageIndex * PAGE_SIZE + 1;
  const to = Math.min(total, (pagination.pageIndex + 1) * PAGE_SIZE);

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <table
          aria-label={label}
          className="w-full min-w-max border-collapse text-[13px] whitespace-nowrap"
        >
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const id = header.column.id;
                  const sorted = header.column.getIsSorted();
                  const right = align.get(id) === 'right';
                  const tip = tips.get(id);
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                      className={`h-10 border-b border-line pr-4 align-middle text-xs font-medium text-faint last:pr-0 ${right ? 'text-right' : 'text-left'}`}
                    >
                      {tip ? (
                        <span
                          className={`inline-flex items-center gap-1 ${right ? 'flex-row-reverse' : ''}`}
                        >
                          <MetricTip
                            id={tip}
                            basis={basis}
                            className="text-xs font-medium"
                          >
                            {String(header.column.columnDef.header)}
                          </MetricTip>
                          <SortButton
                            label={String(header.column.columnDef.header)}
                            sorted={sorted}
                            named={false}
                            right={right}
                            onClick={header.column.getToggleSortingHandler()}
                          />
                        </span>
                      ) : (
                        <SortButton
                          label={String(header.column.columnDef.header)}
                          sorted={sorted}
                          named
                          right={right}
                          onClick={header.column.getToggleSortingHandler()}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {page.map((row) => (
              <tr
                key={row.id}
                className="h-[38px] border-t border-line/70 text-text first:border-t-0 hover:bg-sunken/60"
              >
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`py-1 pr-4 last:pr-0 ${align.get(cell.column.id) === 'right' ? 'text-right tabular-nums' : 'text-left'}`}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3 text-[12.5px] text-faint">
        <p className="tabular-nums">
          {from}-{to} of {total} {plural(total, 'row')}
        </p>
        {pages > 1 ? (
          <nav aria-label={`${label} pages`} className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={pagination.pageIndex === 0}
              onClick={() => table.previousPage()}
              className="h-8 rounded-control border border-line px-3 font-medium text-text outline-offset-2 hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent disabled:text-faint pointer-coarse:h-11"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={pagination.pageIndex >= pages - 1}
              onClick={() => table.nextPage()}
              className="h-8 rounded-control border border-line px-3 font-medium text-text outline-offset-2 hover:border-accent/35 focus-visible:outline-2 focus-visible:outline-accent disabled:text-faint pointer-coarse:h-11"
            >
              Next
            </button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
