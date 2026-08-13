import { Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function WhatsAppSendAction({
  onSend,
  children,
  disabled,
  className,
}: {
  onSend: () => Promise<unknown>;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const [sending, setSending] = useState(false);

  const handleClick = () => {
    if (sending || disabled) return;
    setSending(true);
    Promise.resolve(onSend()).finally(() => setSending(false));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={sending || disabled}
      className={cn(
        "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-muted px-4 py-2.5 font-display text-sm font-extrabold text-foreground transition-transform active:scale-[0.98] disabled:opacity-50",
        className,
      )}
    >
      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
      {children}
    </button>
  );
}
