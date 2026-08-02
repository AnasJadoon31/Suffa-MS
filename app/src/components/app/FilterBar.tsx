import { Filter, Search, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface FilterChip {
  key: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

export function FilterBar({
  chips,
  search,
  activeCount,
  onClear,
  children,
}: {
  chips?: FilterChip[];
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  activeCount: number;
  onClear: () => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(search?.value ?? "");

  useEffect(() => {
    setLocalSearch(search?.value ?? "");
  }, [search?.value]);

  useEffect(() => {
    if (!search) return;
    const handle = setTimeout(() => {
      if (localSearch !== search.value) search.onChange(localSearch);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-center gap-2">
        {chips && chips.length > 0 ? (
          <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto pb-0.5">
            {chips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onClick}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-2 text-xs font-bold transition-colors",
                  chip.active
                    ? "gradient-emerald text-primary-foreground shadow-[var(--shadow-raised)]"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {children ? (
          <button
            onClick={() => setOpen((value) => !value)}
            aria-label="Filters"
            aria-expanded={open}
            className={cn(
              "relative grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors",
              open ? "bg-primary-soft text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Filter className="h-4 w-4" />
            {activeCount > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-destructive text-[0.6rem] font-bold text-white">
                {activeCount}
              </span>
            ) : null}
          </button>
        ) : null}
        {activeCount > 0 ? (
          <button
            onClick={onClear}
            aria-label="Clear filters"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {search ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder={search.placeholder ?? "Search…"}
            className="w-full rounded-2xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary"
          />
        </div>
      ) : null}

      {open && children ? <div className="card-surface space-y-3 p-3.5">{children}</div> : null}
    </div>
  );
}
