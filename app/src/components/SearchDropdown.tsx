import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";


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
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleItems = useMemo(() => {
    const query = value.trim().toLowerCase();
    const ranked = query
      ? items.filter((item) => {
        const label = getLabel(item).toLowerCase();
        const description = getDescription?.(item).toLowerCase() ?? "";
        return label.includes(query) || description.includes(query);
      })
      : items;
    return ranked.slice(0, 8);
  }, [getDescription, getLabel, items, value]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  return (
    <Box
      className="searchDropdown"
      id={id}
      ref={rootRef}
      sx={{ position: "relative" }}
    >
      <TextField
        label={label}
        placeholder={placeholder}
        size="small"
        fullWidth
        disabled={disabled}
        value={value}
        onFocus={() => setIsOpen(!disabled)}
        onChange={(event) => {
          onQueryChange?.(event.target.value);
          setIsOpen(!disabled);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setIsOpen(false);
          }
        }}
        slotProps={{ htmlInput: { autoComplete: "off" } }}
      />
      {isOpen && !disabled && (
        <Paper
          className="searchDropdownMenu"
          elevation={8}
          role="listbox"
          sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
        >
          {visibleItems.map((item) => (
            <Box
              component="button"
              type="button"
              key={getKey(item)}
              className="searchDropdownItem"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(item);
                setIsOpen(false);
              }}
            >
              <Typography component="strong" variant="body2" sx={{ display: "block", fontWeight: 800 }}>
                {getLabel(item)}
              </Typography>
              {getDescription && (
                <Typography component="small" variant="caption" color="text.secondary">
                  {getDescription(item)}
                </Typography>
              )}
            </Box>
          ))}
          {visibleItems.length === 0 && <Box className="searchDropdownEmpty">{emptyLabel}</Box>}
        </Paper>
      )}
    </Box>
  );
}
