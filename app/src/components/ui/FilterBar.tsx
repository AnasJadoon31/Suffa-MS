import { type ReactNode, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import useMediaQuery from "@mui/material/useMediaQuery";
import { styled } from "@mui/material/styles";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Select } from "./Field";

export interface FilterChip {
  key: string;
  label: string;
  active?: boolean;
}

export interface FilterField {
  key: string;
  type: "text" | "select" | "date";
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  value: string;
  options?: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  chips?: FilterChip[];
  onChipToggle?: (key: string) => void;
  fields?: FilterField[];
  onClearAll?: () => void;
  children?: ReactNode;
}

const FilterContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1.5),
  marginBottom: theme.spacing(2),
}));

const ChipsScroll = styled(Box)(() => ({
  display: "flex",
  gap: "6px",
  overflowX: "auto",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
  flexShrink: 0,
}));

const DesktopFieldsRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
  [theme.breakpoints.down("md")]: {
    display: "none",
  },
}));

const MobileSearchRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  [theme.breakpoints.up("md")]: {
    display: "none",
  },
}));

const MobileFiltersRow = styled(Box)(({ theme }) => ({
  display: "flex",
  gap: "8px",
  overflowX: "auto",
  padding: "8px 0",
  scrollbarWidth: "none",
  "&::-webkit-scrollbar": { display: "none" },
}));

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  chips,
  onChipToggle,
  fields = [],
  onClearAll,
  children,
}: FilterBarProps) {
  const isDesktop = useMediaQuery("(min-width: 900px)");
  const [expanded, setExpanded] = useState(false);
  const hasFilters = fields.some((f) => f.value) || (searchValue && searchValue.length > 0);

  return (
    <FilterContainer>
      {/* Mobile: search + filters in horizontal scroll */}
      <MobileSearchRow>
        {onSearchChange && (
          <TextField
            size="small"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{ flex: 1, minWidth: 120 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} />
                  </InputAdornment>
                ),
                endAdornment: searchValue ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => onSearchChange("")}>
                      <X size={16} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
          />
        )}
      </MobileSearchRow>

      {/* Chips row (horizontal scroll on mobile) */}
      {chips && chips.length > 0 && (
        <ChipsScroll>
          {chips.map((chip) => (
            <Chip
              key={chip.key}
              label={chip.label}
              size="small"
              clickable
              color={chip.active ? "primary" : "default"}
              variant={chip.active ? "filled" : "outlined"}
              onClick={() => onChipToggle?.(chip.key)}
            />
          ))}
        </ChipsScroll>
      )}

      {/* Desktop: inline filter fields */}
      <DesktopFieldsRow>
        {onSearchChange && (
          <TextField
            size="small"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{ width: 220 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} />
                  </InputAdornment>
                ),
              },
            }}
          />
        )}
        {fields.map((field) => {
          if (field.type === "select") {
            return (
              <Box component="label" key={field.key} sx={{ display: "flex", flexDirection: "column", gap: 0.5, width: 140 }}>
                {field.label && <span>{field.label}</span>}
                <Select
                  aria-label={field.ariaLabel ?? field.label ?? field.placeholder}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  {field.placeholder && <option value="">{field.placeholder}</option>}
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Box>
            );
          }
          return (
            <TextField
              key={field.key}
              size="small"
              type={field.type === "date" ? "date" : "text"}
              label={field.label}
              placeholder={field.placeholder}
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
              sx={{ width: field.type === "date" ? 160 : 140 }}
              slotProps={{
                htmlInput: field.type === "date" ? { shrink: true } : undefined,
              }}
            />
          );
        })}
        {hasFilters && onClearAll && (
          <Chip label="Clear" size="small" onClick={onClearAll} />
        )}
        {children}
      </DesktopFieldsRow>

      {/* Mobile: horizontal scrollable filters */}
      {!isDesktop && fields.length > 0 && (
        <MobileFiltersRow>
          {fields.map((field) => {
            if (field.type === "select") {
              return (
                <Box component="label" key={field.key} sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 140 }}>
                  {field.label && <span>{field.label}</span>}
                  <Select
                    aria-label={field.ariaLabel ?? field.label ?? field.placeholder}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  >
                    {field.placeholder && <option value="">{field.placeholder}</option>}
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </Box>
              );
            }
            return (
              <TextField
                key={field.key}
                size="small"
                type={field.type === "date" ? "date" : "text"}
                label={field.label}
                placeholder={field.placeholder}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                sx={{ minWidth: field.type === "date" ? 160 : 140 }}
                slotProps={{
                  htmlInput: field.type === "date" ? { shrink: true } : undefined,
                }}
              />
            );
          })}
          {hasFilters && onClearAll && (
            <Chip label="Clear filters" size="small" onClick={onClearAll} sx={{ alignSelf: "flex-start" }} />
          )}
        </MobileFiltersRow>
      )}
    </FilterContainer>
  );
}
