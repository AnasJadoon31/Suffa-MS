import { ReactNode } from "react";
import { Input, Select } from "./Field";
import { Button } from "./Button";
import { FilterBar } from "./Layout";

export type FilterOption = { value: string; label: string };

export type InlineFilterConfig = {
  key: string;
  type: "select";
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
} | {
  key: string;
  type: "input";
  inputType?: "text" | "search" | "date";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
} | {
  key: string;
  type: "tab";
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
};

export function InlineFilter({ filters, children, className = "" }: { filters: InlineFilterConfig[], children?: ReactNode, className?: string }) {
  return (
    <FilterBar className={className}>
      {filters.map((filter) => {
        if (filter.type === "select") {
          return (
            <Select
              key={filter.key}
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              disabled={filter.disabled}
            >
              {filter.placeholder && <option value="">{filter.placeholder}</option>}
              {filter.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          );
        } else if (filter.type === "input") {
          return (
            <Input
              key={filter.key}
              type={filter.inputType ?? "text"}
              value={filter.value}
              placeholder={filter.placeholder}
              disabled={filter.disabled}
              onChange={(event) => filter.onChange(event.target.value)}
            />
          );
        } else if (filter.type === "tab") {
          return filter.options.map(opt => (
            <Button
              key={`${filter.key}-${opt.value}`}
              className={filter.value === opt.value ? "primaryAction" : "secondaryAction"}
              type="button"
              onClick={() => filter.onChange(opt.value)}
            >
              {opt.label}
            </Button>
          ));
        }
        return null;
      })}
      {children}
    </FilterBar>
  );
}
