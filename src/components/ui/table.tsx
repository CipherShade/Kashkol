import type { ReactNode } from "react";
import { EmptyState } from "./feedback";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
  className?: string;
};

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  scrollLabel,
}: {
  /** Announced to screen readers; the visual design is compact. */
  caption: string;
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  scrollLabel: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={empty ?? caption} />;
  }

  return (
    <div className="ui-table-scroll" role="region" aria-label={scrollLabel} tabIndex={0}>
      <table className="ui-table">
        <caption className="ui-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={column.className}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={[
                    column.align === "end" ? "ui-table-cell-end" : "",
                    column.className,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
