import DOMPurify from "dompurify";
import { Bold, Eraser, Heading2, Italic, Link2, List } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "li", "h2"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

function ToolbarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/**
 * Lightweight contentEditable rich-text editor. Emits sanitized HTML via onChange.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string>("");

  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.innerHTML = value;
      lastValue.current = value;
    }
  }, [value]);

  function emit() {
    if (!ref.current) return;
    const clean = String(DOMPurify.sanitize(ref.current.innerHTML, SANITIZE_CONFIG));
    lastValue.current = clean;
    onChange(clean);
  }

  function exec(command: string, arg?: string) {
    document.execCommand(command, false, arg);
    ref.current?.focus();
    emit();
  }

  function handleLink() {
    const url = window.prompt("Link URL");
    if (!url) return;
    exec("createLink", url);
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToolbarButton label="Bold" onClick={() => exec("bold")}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Italic" onClick={() => exec("italic")}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Heading" onClick={() => exec("formatBlock", "h2")}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Bullet list" onClick={() => exec("insertUnorderedList")}>
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Link" onClick={handleLink}>
          <Link2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton label="Clear formatting" onClick={() => exec("removeFormat")}>
          <Eraser className="h-4 w-4" />
        </ToolbarButton>
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className="min-h-32 px-3.5 py-2.5 text-sm outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_a]:text-primary [&_a]:underline [&_h2]:font-display [&_h2]:text-sm [&_h2]:font-extrabold [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}
