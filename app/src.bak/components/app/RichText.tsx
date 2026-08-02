import DOMPurify from "dompurify";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "blockquote",
    "code",
    "pre",
    "span",
  ],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

function stripTags(html: string) {
  return html.replace(/<[^>]*>/g, "");
}

/**
 * Renders untrusted HTML safely. Sanitization runs only in the browser (DOMPurify needs a DOM).
 * On the server / first paint we render a stripped-text fallback so hydration matches, then swap
 * in the sanitized markup once mounted.
 */
export function RichText({
  html,
  className,
  clampLines,
}: {
  html: string;
  className?: string;
  clampLines?: number;
}) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const proseClass = cn(
    "prose-content whitespace-pre-line break-words text-sm text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h1]:font-display [&_h1]:text-base [&_h1]:font-extrabold [&_h1]:text-foreground [&_h2]:font-display [&_h2]:text-sm [&_h2]:font-extrabold [&_h2]:text-foreground [&_h3]:font-display [&_h3]:font-bold [&_h3]:text-foreground [&_strong]:font-bold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic",
    className,
  );
  const clampStyle = clampLines
    ? ({
        display: "-webkit-box",
        WebkitLineClamp: clampLines,
        WebkitBoxOrient: "vertical" as const,
        overflow: "hidden",
      } as const)
    : undefined;

  if (!hydrated) {
    return (
      <p className={proseClass} style={clampStyle}>
        {stripTags(html)}
      </p>
    );
  }

  const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG);
  return (
    <div className={proseClass} style={clampStyle} dangerouslySetInnerHTML={{ __html: clean }} />
  );
}
