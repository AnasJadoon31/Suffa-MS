import { type ReactNode } from "react";
import { Box, Chip, IconButton, InputAdornment, useMediaQuery } from "./Mui";
import { styled } from "@mui/material/styles";
import { Search, X } from "lucide-react";
import { DateInput, Input, SearchInput, Select } from "./Field";
import { PWA_COMPACT_BREAKPOINT, PageToolbar } from "./Layout";
import { useTranslation } from "react-i18next";

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
  searchAriaLabel?: string;
  chips?: FilterChip[];
  onChipToggle?: (key: string) => void;
  fields?: FilterField[];
  onClearAll?: () => void;
  children?: ReactNode;
}

const FilterContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: theme.spacing(1),
  marginBottom: theme.spacing(2),
  minWidth: 0,
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
  flex: 1,
  minWidth: 0,
  [`@media (max-width:${PWA_COMPACT_BREAKPOINT - 1}px)`]: {
    display: "none",
  },
}));

const MobileSearchRow = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  [`@media (min-width:${PWA_COMPACT_BREAKPOINT}px)`]: {
    display: "none",
  },
}));

const MobileFiltersRow = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "8px",
  minWidth: 0,
  [`@media (min-width:${PWA_COMPACT_BREAKPOINT}px)`]: {
    display: "none",
  },
}));

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  searchAriaLabel,
  chips,
  onChipToggle,
  fields = [],
  onClearAll,
  children,
}: FilterBarProps) {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery(`(min-width:${PWA_COMPACT_BREAKPOINT}px)`);
  const hasFilters = fields.some((f) => f.value) || (searchValue && searchValue.length > 0);

  return (
    <PageToolbar className="inlineFilter pwaFilterStack">
      <FilterContainer sx={{ flex: 1 }}>
      {/* Mobile: search + filters in horizontal scroll */}
      {!isDesktop && onSearchChange && (
        <MobileSearchRow>
          <SearchInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{ flex: 1, minWidth: 0 }}
            slotProps={{
              htmlInput: {
                "aria-label": searchAriaLabel ?? searchPlaceholder,
              },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} />
                  </InputAdornment>
                ),
                endAdornment: searchValue ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => onSearchChange("")} aria-label={t("clearSearch", { defaultValue: "Clear search" })}>
                      <X size={16} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
          />
        </MobileSearchRow>
      )}

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
      {isDesktop && (
        <DesktopFieldsRow>
        {onSearchChange && (
          <SearchInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            sx={{ width: 220 }}
            slotProps={{
              htmlInput: {
                "aria-label": searchAriaLabel ?? searchPlaceholder,
              },
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
                <Box component="label" key={field.key} sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 160, flex: "1 1 160px" }}>
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
            field.type === "date" ? (
              <DateInput
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                sx={{ width: 170 }}
              />
            ) : (
              <Input
                key={field.key}
                label={field.label}
                placeholder={field.placeholder}
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
                sx={{ width: 180 }}
              />
            )
          );
        })}
        {hasFilters && onClearAll && (
          <Chip label={t("clearFiltersBtn")} size="small" onClick={onClearAll} />
        )}
        </DesktopFieldsRow>
      )}

      {/* Mobile: horizontal scrollable filters */}
      {!isDesktop && fields.length > 0 && (
        <MobileFiltersRow>
          {fields.map((field) => {
            if (field.type === "select") {
              return (
                <Box component="label" key={field.key} sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
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
              field.type === "date" ? (
                <DateInput
                  key={field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  sx={{ minWidth: 0 }}
                />
              ) : (
                <Input
                  key={field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  sx={{ minWidth: 0 }}
                />
              )
            );
          })}
          {hasFilters && onClearAll && (
            <Chip label={t("clearFiltersBtn")} size="small" onClick={onClearAll} sx={{ alignSelf: "flex-start" }} />
          )}
        </MobileFiltersRow>
      )}
      </FilterContainer>
      {children && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>{children}</Box>}
    </PageToolbar>
  );
}
