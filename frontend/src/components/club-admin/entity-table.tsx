"use client";

import { Fragment, useMemo, type ReactNode } from "react";

import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
import { directedCompare, toggleSort, type TableSort } from "@/lib/table-sort";

export type EntityTableColumn<T> = {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => unknown;
  headerClassName?: string;
  cellClassName?: string;
};

type EntityTableProps<T> = {
  columns: Array<EntityTableColumn<T>>;
  rows: T[];
  onRowClick?: (row: T) => void;
  /** Extra full-width row rendered under a data row. Return null to keep the row closed. */
  renderDetail?: (row: T) => ReactNode | null;
  sort?: TableSort | null;
  onSortChange?: (sort: TableSort) => void;
  /** Sort the rows passed in. Use this when the table already has every row. */
  clientSort?: boolean;
  /** Skip the outer card. Use this when the table already sits inside a panel. */
  embedded?: boolean;
};

export function EntityTable<T extends { id: number | string }>({
  columns,
  rows,
  onRowClick,
  renderDetail,
  sort = null,
  onSortChange,
  clientSort = false,
  embedded = false,
}: EntityTableProps<T>) {
  const isClickable = Boolean(onRowClick);
  const displayedRows = useMemo(() => {
    if (!clientSort || !sort) {
      return rows;
    }
    const column = columns.find((item) => item.key === sort.key && item.sortValue);
    if (!column?.sortValue) {
      return rows;
    }
    const getValue = column.sortValue;
    return [...rows].sort((left, right) => directedCompare(getValue(left), getValue(right), sort.direction));
  }, [clientSort, columns, rows, sort]);

  return (
    <div className={embedded ? "overflow-x-auto" : "app-panel overflow-x-auto"}>
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border bg-secondary/70 text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((column) => {
              const active = Boolean(sort && sort.key === column.key);
              const ariaSort = column.sortable
                ? active
                  ? sort?.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
                : undefined;
              return (
                <th key={column.key} className={`px-4 py-3 font-medium ${column.headerClassName ?? ""}`} aria-sort={ariaSort} scope="col">
                  {column.sortable && onSortChange ? (
                    <SortableColumnHeader
                      label={column.header}
                      active={active}
                      direction={active ? sort?.direction : undefined}
                      onSort={() => onSortChange(toggleSort(sort, column.key))}
                    />
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/80">
          {displayedRows.map((row) => {
            const detail = renderDetail?.(row) ?? null;
            return (
              <Fragment key={row.id}>
                <tr
                  className={`h-[var(--table-row-height)] text-foreground transition-colors ${
                    detail
                      ? "bg-secondary/70"
                      : isClickable
                        ? "cursor-pointer hover:bg-[color-mix(in_oklab,var(--accent)_6%,white)]"
                        : "hover:bg-secondary/50"
                  }`}
                  onClick={(event) => {
                    if (!onRowClick) {
                      return;
                    }
                    const target = event.target as HTMLElement | null;
                    if (target?.closest("button, a, input, select, textarea")) {
                      return;
                    }
                    onRowClick(row);
                  }}
                  onKeyDown={(event) => {
                    if (!onRowClick) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }}
                  tabIndex={isClickable ? 0 : undefined}
                  role={isClickable ? "button" : undefined}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`px-4 py-3 ${column.cellClassName ?? ""}`}>
                      {column.render ? column.render(row) : (row as Record<string, ReactNode>)[column.key]}
                    </td>
                  ))}
                </tr>
                {detail ? (
                  <tr className="bg-secondary/40">
                    <td colSpan={columns.length} className="px-4 py-4">
                      {detail}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
