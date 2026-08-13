import { Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";

export function MessageSendButton({
  onSend,
  ariaLabel,
}: {
  onSend: () => void | Promise<unknown>;
  ariaLabel: string;
}) {
  const [sending, setSending] = useState(false);

  const handleClick = () => {
    if (sending) return;
    setSending(true);
    Promise.resolve(onSend()).finally(() => setSending(false));
  };

  return (
    <button
      aria-label={ariaLabel}
      onClick={handleClick}
      disabled={sending}
      className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent-foreground disabled:opacity-60"
    >
      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
    </button>
  );
}
