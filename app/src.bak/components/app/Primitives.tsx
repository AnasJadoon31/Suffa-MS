import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card-surface p-4", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 first:mt-0">
      <h2 className="truncate font-display text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </h2>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "gold" | "success" | "destructive";
}) {
  const tones = {
    default: "bg-primary-soft text-primary",
    gold: "bg-accent-soft text-accent-foreground",
    success: "bg-primary-soft text-success",
    destructive: "bg-accent-soft text-destructive",
  } as const;

  return (
    <div className="card-surface flex items-center gap-3 p-3.5">
      {Icon ? (
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="truncate text-[0.7rem] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="font-display text-xl font-extrabold leading-tight">{value}</p>
      </div>
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "success" | "destructive" | "warning" | "gold";
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    success: "bg-primary-soft text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/15 text-warning-foreground",
    gold: "bg-accent-soft text-accent-foreground",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card-surface px-4 py-10 text-center">
      <p className="font-display text-base font-bold">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="card-surface h-16 animate-pulse bg-muted" />
      ))}
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "soft" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const variants = {
    primary: "gradient-emerald text-primary-foreground shadow-[var(--shadow-raised)]",
    soft: "bg-muted text-foreground",
    danger: "bg-destructive/10 text-destructive",
    ghost: "text-primary",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 font-display text-sm font-extrabold transition-transform active:scale-[0.98] disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

const controlClass =
  "w-full rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cn(controlClass, "resize-y", props.className)} />;
}

export function CustomDropdown(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, disabled, ...rest } = props;
  return (
    <div className="relative">
      <select
        {...rest}
        disabled={disabled}
        className={cn(
          controlClass,
          "appearance-none pr-10",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors",
          disabled && "opacity-60",
        )}
      />
    </div>
  );
}

export const SelectInput = CustomDropdown;

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="mb-3 flex gap-1.5 rounded-2xl bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.key}
          onClick={() => onChange(option.key)}
          className={cn(
            "flex-1 rounded-xl py-2 text-xs font-bold uppercase tracking-wide transition-colors",
            value === option.key
              ? "bg-card text-primary shadow-[var(--shadow-soft)]"
              : "text-muted-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mt-5 flex gap-2", className)}>
      {children}
    </div>
  );
}

export function ManagedSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  children,
}: {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-border bg-card px-4 pb-8 pt-5"
      >
        <SheetTitle
          className={cn("font-display text-lg font-extrabold", subtitle ? "mb-1" : "mb-4")}
        >
          {title}
        </SheetTitle>
        {subtitle ? <div className="mb-3">{subtitle}</div> : null}
        {children}
      </SheetContent>
    </Sheet>
  );
}
