import { Fragment } from "react";

type Column<T> = {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
};

type EntityTableProps<T> = {
  columns: Array<Column<T>>;
  rows: T[];
  onRowClick?: (row: T) => void;
  /** Extra full-width row rendered under a data row. Return null to keep the row closed. */
  renderDetail?: (row: T) => React.ReactNode | null;
};

export function EntityTable<T extends { id: number | string }>({
  columns,
  rows,
  onRowClick,
  renderDetail,
}: EntityTableProps<T>) {
  const isClickable = Boolean(onRowClick);
  return (
    <div className="app-panel overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border bg-secondary/70 text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-3 font-medium">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/80">
          {rows.map((row) => {
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
                    <td key={column.key} className="px-4 py-3">
                      {column.render ? column.render(row) : (row as Record<string, React.ReactNode>)[column.key]}
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
