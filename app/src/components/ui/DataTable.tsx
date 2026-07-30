import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import useMediaQuery from "@mui/material/useMediaQuery";
import { styled } from "@mui/material/styles";
import { LoadingState, ErrorState } from "./AsyncState";

/* ------------------------------------------------------------------ types */

export interface Column<T> {
  /** Header label — typically `t("someCol")` or a ReactNode. */
  header: ReactNode;
  /** Cell renderer for this column. */
  render: (item: T, index: number) => ReactNode;
  /** Optional class applied to this column's header and body cells. */
  className?: string;
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

/* ------------------------------------------------------------------ styled components */

export const StyledTable = styled(Table)(({ theme }) => ({
  borderCollapse: "separate",
  borderSpacing: 0,
  width: "100%",
}));

export const StyledTableRow = styled(TableRow)(({ theme }) => ({
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
  "&:last-child td, &:last-child th": {
    borderBottom: 0,
  },
}));

export const StyledTableCell = styled(TableCell)(({ theme }) => ({
  padding: theme.spacing(1.5, 2),
  borderColor: theme.palette.divider,
}));

export const StyledTableHeader = styled(TableCell)(({ theme }) => ({
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: "0.75rem",
  color: theme.palette.teal.main,
  backgroundColor: "transparent",
  borderBottom: `2px solid ${theme.palette.divider}`,
  padding: theme.spacing(1.5, 2),
}));

export const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  width: "100%",
  overflowX: "auto",
  overflowY: "visible",
  borderColor: theme.palette.divider,
  boxShadow: "none",
  borderRadius: 16,
  border: `1px solid ${theme.palette.divider}`,
}));

/* ------------------------------------------------------------------ component */

/**
 * Generic data-table primitive that replaces the repeated
 * `<div className="dataTable"> … header … loading … empty … rows` boilerplate.
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
  const renderCards = useMediaQuery("(max-width: 768px)");

  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      className={className}
      sx={{
        width: "100%",
        overflowX: "auto",
        overflowY: "visible",
        borderColor: "divider",
        boxShadow: "none",
        borderRadius: 2,
      }}
    >
      {isLoading && (
        <Box sx={{ p: 3 }}>
          <LoadingState />
        </Box>
      )}
      {!isLoading && error && (
        <Box sx={{ p: 3 }}>
          <ErrorState message={error} />
        </Box>
      )}
      {showData && data.length === 0 && emptyMessage && (
        <Box sx={{ p: 3 }}>
          {emptyMessage}
        </Box>
      )}
      {showData && data.length > 0 && !renderCards && (
        <Table size="small" stickyHeader aria-label="data table" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                {columns.map((col, i) => (
                  <StyledTableHeader key={i} className={col.className}>
                    {col.header}
                  </StyledTableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((item, index) => (
                <DataRow
                  key={keyExtractor(item)}
                  item={item}
                  index={index}
                  data={data}
                  columns={columns}
                  renderBeforeRow={renderBeforeRow}
                />
              ))}
            </TableBody>
          </Table>
      )}
      {showData && data.length > 0 && renderCards && (
        <Box role="list" aria-label="data cards">
          {data.map((item, index) => (
            <MobileDataCard
              key={keyExtractor(item)}
              item={item}
              index={index}
              data={data}
              columns={columns}
              renderBeforeRow={renderBeforeRow}
            />
          ))}
        </Box>
      )}
    </TableContainer>
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
      {before && (
        <StyledTableRow>
          <TableCell colSpan={columns.length}>{before}</TableCell>
        </StyledTableRow>
      )}
      <StyledTableRow>
        {columns.map((col, i) => {
          const label = typeof col.header === "string" ? col.header : undefined;
          return <StyledTableCell key={i} data-label={label} className={col.className}>{col.render(item, index)}</StyledTableCell>;
        })}
      </StyledTableRow>
    </>
  );
}

function MobileDataCard<T>({
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
      {before && <div>{before}</div>}
      <dl role="listitem">
        {columns.map((col, i) => (
          <div key={i}>
            <dt>{col.header}</dt>
            <dd>{col.render(item, index)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
