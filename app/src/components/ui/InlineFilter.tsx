import { ReactNode } from "react";
import { Box } from "./Mui";
import { Input, Select } from "./Field";
import { FilterActions, FilterBarContainer, FilterFieldGroup, ResponsiveTabs } from "./Layout";

export type FilterOption = { value: string; label: string };

export type InlineFilterConfig = {
  key: string;
  type: "select";
  label?: string;
  ariaLabel?: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
} | {
  key: string;
  type: "input";
  label?: string;
  ariaLabel?: string;
  inputType?: "text" | "search" | "date";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
} | {
  key: string;
  type: "tab";
  label?: string;
  ariaLabel?: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
};

export function InlineFilter({ filters, children, sx }: { filters: InlineFilterConfig[], children?: ReactNode; sx?: any }) {
  return (
    <FilterBarContainer sx={{ ...sx }}>
      <FilterFieldGroup>
        {filters.map((filter) => {
          if (filter.type === "select") {
            return (
              <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }} key={filter.key}>
                {filter.label && <span>{filter.label}</span>}
                <Select
                  aria-label={filter.ariaLabel ?? filter.label ?? filter.placeholder}
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
                  disabled={filter.disabled}
                >
                  {filter.placeholder && <option value="">{filter.placeholder}</option>}
                  {filter.options.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Select>
              </Box>
            );
          } else if (filter.type === "input") {
            return (
              <Box component="label" sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }} key={filter.key}>
                {filter.label && <span>{filter.label}</span>}
                <Input
                  aria-label={filter.ariaLabel ?? filter.label ?? filter.placeholder}
                  type={filter.inputType ?? "text"}
                  value={filter.value}
                  placeholder={filter.placeholder}
                  disabled={filter.disabled}
                  onChange={(event) => filter.onChange(event.target.value)}
                />
              </Box>
            );
          } else if (filter.type === "tab") {
            return (
              <Box key={filter.key} sx={{ gridColumn: "1 / -1", minWidth: 0 }}>
                <ResponsiveTabs
                  value={filter.value}
                  ariaLabel={filter.ariaLabel ?? filter.label}
                  options={filter.options}
                  onChange={filter.onChange}
                />
              </Box>
            );
          }
          return null;
        })}
      </FilterFieldGroup>
      {children && <FilterActions>{children}</FilterActions>}
    </FilterBarContainer>
  );
}
