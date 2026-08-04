import { Loader2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { ActionButton, ManagedSheet } from "./Primitives";
import { SheetTrigger } from "@/components/ui/sheet";

export function FormSheet({
  title,
  triggerLabel,
  submitLabel = "Save",
  onSubmit,
  children,
  open,
  onOpenChange,
}: {
  title: string;
  triggerLabel?: string;
  submitLabel?: string;
  onSubmit: () => Promise<unknown> | unknown;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onSubmit();
      setOpen(false);
    } catch {
      /* API layer already surfaces the error toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <ManagedSheet
      open={isOpen}
      onOpenChange={setOpen}
      title={title}
      trigger={
        triggerLabel ? (
          <SheetTrigger className="gradient-emerald inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 font-display text-xs font-extrabold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-raised)]">
            {triggerLabel}
          </SheetTrigger>
        ) : undefined
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {children}
        <ActionButton type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </ActionButton>
      </form>
    </ManagedSheet>
  );
}
