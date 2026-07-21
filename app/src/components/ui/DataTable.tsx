import type { ReactNode } from "react";
import { LoadingState, ErrorState } from "./AsyncState";

/* ------------------------------------------------------------------ types */

export interface Column<T> {
  /** Header label — typically `t("someCol")` or a ReactNode. */
  header: ReactNode;
  /** Cell renderer for this column. */
  render: (item: T, index: number) => ReactNode;
}

export interface DataTableProps<T> {
  /** Column definitions: header label + cell renderer per column. */
  columns: Column<T>[];
  /** The array of items to render as rows. */
  data: T[];
  /** Unique key for each row — usually `(item) => item.id`. */
  keyExtractor: (item: T) => string | number;
  /** Show a loading spinner instead of rows. */
  isLoading?: boolean;
  /** If truthy, show an error message instead of rows. */
  error?: string | null;
  /** Message shown when `data` is empty and not loading/errored. */
  emptyMessage?: string;
  /** Extra CSS class(es) appended to the outer `dataTable` div. */
  className?: string;
  /**
   * Optional callback rendered *before* each data row.
   * Use for section dividers, group headers, etc.
   * Return `null` when nothing should precede the row.
   */
  renderBeforeRow?: (item: T, index: number, data: T[]) => ReactNode;
}

/* ------------------------------------------------------------------ component */

/**
 * Generic data-table primitive that replaces the repeated
 * `<div className="dataTable"> … header … loading … empty … rows` boilerplate.
 *
 * Reuses the existing `dataTable` / `dataRow` / `header` CSS classes —
 * zero visual change, just less copy-paste.
 */
export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  error,
  emptyMessage,
  className,
  renderBeforeRow,
}: Readonly<DataTableProps<T>>) {
  const showData = !isLoading && !error;

  return (
    <div className="tableResponsive">
      <div className={className ? `dataTable ${className}` : "dataTable"}>
        {/* ---- header row ---- */}
        <div className="dataRow header">
        {columns.map((col, i) => (
          <span key={i}>{col.header}</span>
        ))}
      </div>

      {/* ---- async states ---- */}
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {showData && data.length === 0 && emptyMessage && (
        <p className="emptyState">{emptyMessage}</p>
      )}

      {/* ---- data rows ---- */}
      {showData &&
        data.map((item, index) => (
          <DataRow
            key={keyExtractor(item)}
            item={item}
            index={index}
            data={data}
            columns={columns}
            renderBeforeRow={renderBeforeRow}
          />
        ))}
      </div>
    </div>
  );
}

/* ---- internal row wrapper (keeps Fragment key logic clean) ---- */

function DataRow<T>({
  item,
  index,
  data,
  columns,
  renderBeforeRow,
}: Readonly<{
  item: T;
  index: number;
  data: T[];
  columns: Column<T>[];
  renderBeforeRow?: (item: T, index: number, data: T[]) => ReactNode;
}>) {
  const before = renderBeforeRow?.(item, index, data);
  return (
    <>
      {before}
      <div className="dataRow">
        {columns.map((col, i) => (
          <span key={i}>{col.render(item, index)}</span>
        ))}
      </div>
    </>
  );
}
