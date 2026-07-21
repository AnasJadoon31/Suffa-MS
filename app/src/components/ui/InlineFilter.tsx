import { ReactNode } from "react";
import { Input, Select } from "./Field";
import { Button } from "./Button";
import { FilterBar } from "./Layout";

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

export function InlineFilter({ filters, children, className = "" }: { filters: InlineFilterConfig[], children?: ReactNode, className?: string }) {
  return (
    <FilterBar className={`inlineFilter ${className}`.trim()}>
      {filters.map((filter) => {
        if (filter.type === "select") {
          return (
            <label className="inlineFilterField" key={filter.key}>
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
            </label>
          );
        } else if (filter.type === "input") {
          return (
            <label className="inlineFilterField" key={filter.key}>
              {filter.label && <span>{filter.label}</span>}
              <Input
                aria-label={filter.ariaLabel ?? filter.label ?? filter.placeholder}
                type={filter.inputType ?? "text"}
                value={filter.value}
                placeholder={filter.placeholder}
                disabled={filter.disabled}
                onChange={(event) => filter.onChange(event.target.value)}
              />
            </label>
          );
        } else if (filter.type === "tab") {
          return (
            <div className="inlineFilterTabs" role="group" aria-label={filter.ariaLabel ?? filter.label} key={filter.key}>
              {filter.options.map(opt => (
                <Button
                  key={`${filter.key}-${opt.value}`}
                  className={filter.value === opt.value ? "primaryAction" : "secondaryAction"}
                  type="button"
                  aria-pressed={filter.value === opt.value}
                  onClick={() => filter.onChange(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          );
        }
        return null;
      })}
      {children && <div className="inlineFilterActions">{children}</div>}
    </FilterBar>
  );
}
