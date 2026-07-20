import { Button } from "./ui/Button";
import { useMemo, useState } from "react";
import { Input } from "./ui/Field";


type SearchDropdownProps<T> = Readonly<{
  id: string;
  label: string;
  placeholder?: string;
  items: T[];
  value: string;
  disabled?: boolean;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => string;
  onQueryChange?: (query: string) => void;
  onSelect: (item: T) => void;
  emptyLabel?: string;
}>;

export function SearchDropdown<T>({
  id,
  label,
  placeholder,
  items,
  value,
  disabled = false,
  getKey,
  getLabel,
  getDescription,
  onQueryChange,
  onSelect,
  emptyLabel = "No matches",
}: SearchDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const visibleItems = useMemo(() => items.slice(0, 8), [items]);

  return (
    <div className="searchDropdown">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        onChange={(event) => {
          onQueryChange?.(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && !disabled && (
        <div className="searchDropdownMenu" role="listbox">
          {visibleItems.length === 0 && <span className="searchDropdownEmpty">{emptyLabel}</span>}
          {visibleItems.map((item) => (
            <Button
              className="searchDropdownItem"
              key={getKey(item)}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(item);
                setIsOpen(false);
              }}
            >
              <strong>{getLabel(item)}</strong>
              {getDescription && <small>{getDescription(item)}</small>}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
