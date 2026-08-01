import type { ReactNode } from "react";
import { Box } from "./Mui";
import { Paper } from "./Mui";
import { Table } from "./Mui";
import { TableBody } from "./Mui";
import { TableCell } from "./Mui";
import { TableContainer } from "./Mui";
import { TableHead } from "./Mui";
import { TableRow } from "./Mui";
import { Typography } from "./Mui";
import { useMediaQuery } from "./Mui";
import { styled } from "@mui/material/styles";
import { LoadingState, ErrorState } from "./AsyncState";
import { PWA_COMPACT_BREAKPOINT } from "./Layout";

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

const StyledTable = styled(Table)(({ theme }) => ({
  borderCollapse: "separate",
  borderSpacing: 0,
  width: "100%",
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },
  "&:last-child td, &:last-child th": {
    borderBottom: 0,
  },
}));

const StyledTableCell = styled(TableCell)(({ theme }) => ({
  padding: theme.spacing(1.25, 1.5),
  borderColor: theme.palette.divider,
  verticalAlign: "top",
  overflowWrap: "anywhere",
}));

const StyledTableHeader = styled(TableCell)(({ theme }) => ({
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: "0.75rem",
  color: theme.palette.teal.main,
  backgroundColor: "transparent",
  borderBottom: `2px solid ${theme.palette.divider}`,
  padding: theme.spacing(1.25, 1.5),
  whiteSpace: "nowrap",
}));

const StyledTableContainer = styled(TableContainer)(({ theme }) => ({
  width: "100%",
  overflowX: "auto",
  overflowY: "visible",
  borderColor: theme.palette.divider,
  boxShadow: "none",
  borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
}));

const CardGrid = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
  gap: theme.spacing(1.5),
}));

const StyledCard = styled(Paper)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  padding: theme.spacing(1.5),
  borderRadius: 8,
  border: `1px solid ${theme.palette.divider}`,
  overflow: "hidden",
  transition: "box-shadow 0.2s ease, transform 0.15s ease",
  "&:hover": {
    boxShadow: theme.shadows[4],
    transform: "translateY(-1px)",
  },
}));

const CardField = styled(Box)(() => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "8px 0",
  borderBottom: "1px solid",
  borderColor: "divider",
  "&:last-child": {
    borderBottom: "none",
  },
}));

const FieldLabel = styled(Typography)(({ theme }) => ({
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: theme.palette.text.secondary,
}));

const FieldValue = styled(Box)(() => ({
  fontSize: "0.875rem",
  fontWeight: 500,
  minWidth: 0,
  textAlign: "end",
  overflowWrap: "anywhere",
}));

/* ------------------------------------------------------------------ component */

/**
 * Generic data-table primitive that renders as a table on desktop
 * and as cards on mobile.
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
  const renderCards = useMediaQuery(`(max-width: ${PWA_COMPACT_BREAKPOINT - 1}px)`);

  return (
    <Box className={`tableResponsive${className ? ` ${className}` : ""}`} sx={{ minWidth: 0, width: "100%" }}>
      {isLoading && <LoadingState />}
      {!isLoading && error && <ErrorState message={error} />}
      {showData && data.length === 0 && emptyMessage && (
        <Box sx={{ p: 3, textAlign: "center" }}>
          {emptyMessage}
        </Box>
      )}
      {showData && data.length > 0 && !renderCards && (
        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{
            width: '100%',
            overflowX: 'auto',
            overflowY: 'visible',
            borderColor: 'divider',
            boxShadow: 'none',
            borderRadius: 1,
            border: '1px solid',
          }}
          className="desktopDataTable"
        >
          <StyledTable className="desktopDataTable" size="small" stickyHeader aria-label="data table">
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
          </StyledTable>
        </TableContainer>
      )}
      {showData && data.length > 0 && renderCards && (
        <CardGrid role="list" aria-label="data cards" className="mobileDataCards">
          {data.map((item, index) => (
            <DataCard
              key={keyExtractor(item)}
              item={item}
              index={index}
              data={data}
              columns={columns}
              renderBeforeRow={renderBeforeRow}
            />
          ))}
        </CardGrid>
      )}
    </Box>
  );
}

/* ---- internal row wrapper ---- */

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
      <StyledTableRow className="dataRow">
        {columns.map((col, i) => {
          const label = typeof col.header === "string" ? col.header : undefined;
          return <StyledTableCell key={i} data-label={label} className={col.className}>{col.render(item, index)}</StyledTableCell>;
        })}
      </StyledTableRow>
    </>
  );
}

function DataCard<T>({
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
      {before && <Box sx={{ gridColumn: "1 / -1" }}>{before}</Box>}
      <StyledCard role="listitem" variant="outlined" className="mobileDataCard dataRow">
        {columns.map((col, i) => {
          const label = typeof col.header === "string" ? col.header : undefined;
          return (
            <CardField key={i} data-label={label}>
              {label && <FieldLabel>{label}</FieldLabel>}
              <FieldValue>{col.render(item, index)}</FieldValue>
            </CardField>
          );
        })}
      </StyledCard>
    </>
  );
}
