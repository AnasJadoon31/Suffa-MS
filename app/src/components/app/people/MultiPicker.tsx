import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { TextInput } from "@/components/app/Primitives";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/** Generic search + multi-select picker for linking students/guardians. */
export function MultiPicker({
  label,
  selected,
  onChange,
  fetchOptions,
  queryKey,
}: {
  label: string;
  selected: { id: string; name: string }[];
  onChange: (next: { id: string; name: string }[]) => void;
  fetchOptions: (search: string) => Promise<{ id: string; name: string }[]>;
  queryKey: string;
}) {
    const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: [queryKey, search],
    queryFn: () => fetchOptions(search),
  });

  const options = query.data ?? [];
  const selectedIds = new Set(selected.map((item) => item.id));

  function toggle(option: { id: string; name: string }) {
    if (selectedIds.has(option.id)) {
      onChange(selected.filter((item) => item.id !== option.id));
    } else {
      onChange([...selected, option]);
    }
  }

  return (
    <div className="space-y-1.5">
      <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item)}
              className="rounded-full bg-primary-soft px-2.5 py-1 text-[0.68rem] font-bold text-primary"
            >
              {item.name} ×
            </button>
          ))}
        </div>
      ) : null}
      <TextInput
        placeholder={`Search ${label.toLowerCase()}...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-2xl border border-border p-1.5">
        {query.isLoading ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("Loading…")}</p>
        ) : options.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("No matches")}</p>
        ) : (
          options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => toggle(option)}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-sm",
                selectedIds.has(option.id)
                  ? "bg-primary-soft text-primary font-semibold"
                  : "hover:bg-muted",
              )}
            >
              {option.name}
              {selectedIds.has(option.id) ? "✓" : ""}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
