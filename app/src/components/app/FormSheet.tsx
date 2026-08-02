import { Loader2, Plus } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { ActionButton } from "./Primitives";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
    <Sheet open={isOpen} onOpenChange={setOpen}>
      {triggerLabel ? (
        <SheetTrigger className="gradient-emerald inline-flex items-center gap-1.5 rounded-2xl px-3.5 py-2 font-display text-xs font-extrabold uppercase tracking-wide text-primary-foreground shadow-[var(--shadow-raised)]">
          <Plus className="h-3.5 w-3.5" />
          {triggerLabel}
        </SheetTrigger>
      ) : null}
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-border bg-card px-4 pb-8 pt-5"
      >
        <SheetTitle className="mb-4 font-display text-lg font-extrabold">{title}</SheetTitle>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {children}
          <ActionButton type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </ActionButton>
        </form>
      </SheetContent>
    </Sheet>
  );
}
