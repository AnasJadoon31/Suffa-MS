import React, { type ReactNode, useState } from "react";
import { Check, ChevronDown, ChevronsUpDown, Eye, EyeOff, type LucideIcon } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode; [key: string]: unknown }) {
  return (
    <div className={cn("card-surface p-4", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={className ? `mb-3 mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 first:mt-0 ${className}` : "mb-3 mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 first:mt-0"}>
      <h2 className="truncate font-display text-sm font-extrabold uppercase tracking-[0.14em] text-muted-foreground rtl:font-bold rtl:tracking-normal rtl:leading-relaxed">
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
  variant?: "primary" | "soft" | "danger" | "success" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  const variants = {
    primary: "gradient-emerald text-primary-foreground shadow-[var(--shadow-raised)]",
    soft: "bg-muted text-foreground",
    danger: "bg-destructive/10 text-destructive",
    success: "bg-[oklch(0.72_0.15_158)] text-black shadow-[var(--shadow-raised)]",
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

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className ? `block space-y-1.5 ${className}` : "block space-y-1.5"}>
      <span className="block text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground rtl:text-xs rtl:font-bold rtl:tracking-normal rtl:leading-relaxed">
        {label}
      </span>
      {children}
    </label>
  );
}

const controlClass =
  "w-full rounded-2xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = props.type === "password";

  if (isPassword) {
    return (
      <div className="relative">
        <input
          {...props}
          type={showPassword ? "text" : "password"}
          className={cn(controlClass, props.className, "ltr:pr-10 rtl:pl-10")}
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground rtl:right-auto rtl:left-0"
          onClick={() => setShowPassword((s) => !s)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }

  return <input {...props} className={cn(controlClass, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cn(controlClass, "resize-y", props.className)} />;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className,
  searchValue,
  onSearchChange,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  className?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);
  const { t } = useTranslation();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            controlClass,
            "min-h-[48px] py-2.5 flex select-none items-center justify-between ltr:pl-3 ltr:pr-2 rtl:pr-3 rtl:pl-2 w-full text-sm",
            !selectedOption && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selectedOption?.label ?? placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={t("Search") + "..."}
            value={searchValue}
            onValueChange={onSearchChange}
          />
          <CommandList>
            <CommandEmpty>{t("No results")}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.value}
                value={option.label}
                disabled={option.disabled}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    option.value === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{option.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function extractSelectOptions(children: ReactNode): { value: string; label: string; disabled?: boolean }[] {
  const opts: { value: string; label: string; disabled?: boolean }[] = [];
  if (!children) return opts;
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child) || child.type !== "option") return;
    const props = child.props as Record<string, unknown>;
    if (props["value"] !== undefined && props["value"] !== null && props["value"] !== "") {
      opts.push({
        value: String(props["value"]),
        label: String(props["children"] ?? props["value"]),
        disabled: Boolean(props["disabled"]),
      });
    }
  });
  return opts;
}

export function CustomDropdown(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, disabled, ...rest } = props;
  if (disabled || !children) {
    return (
      <div className="relative">
        <select
          {...rest}
          disabled={disabled}
          className={cn(
            controlClass,
            "min-h-[48px] py-2.5 appearance-none ltr:pr-8 ltr:pl-3 rtl:pl-8 rtl:pr-3",
            disabled && "cursor-not-allowed opacity-60",
            className,
          )}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors ltr:right-2.5 rtl:left-2.5",
            disabled && "opacity-60",
          )}
        />
      </div>
    );
  }

  const options = extractSelectOptions(children);

  return (
    <SearchableSelect
      value={rest.value as string}
      onChange={(v) => {
        const syntheticEvent = {
          target: { value: v },
        } as React.ChangeEvent<HTMLSelectElement>;
        rest.onChange?.(syntheticEvent);
      }}
      options={options}
      placeholder={(rest as Record<string, unknown>)["placeholder"] as string || rest["aria-label"] || undefined}
      className={className}
    />
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
  const { t } = useTranslation();
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
          {t(option.label)}
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
  trigger,
  children,
}: {
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  trigger?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger}
      <SheetContent
        side="bottom"
        className="max-h-[88vh] overflow-y-auto rounded-t-3xl border-border bg-card px-4 pb-8 pt-5"
      >
         <SheetTitle
           className={cn("font-display text-lg font-extrabold [overflow-wrap:anywhere]", subtitle ? "mb-1" : "mb-4")}
         >
           {title}
         </SheetTitle>
        {subtitle ? <div className="mb-3">{subtitle}</div> : null}
        {children}
      </SheetContent>
    </Sheet>
  );
}
