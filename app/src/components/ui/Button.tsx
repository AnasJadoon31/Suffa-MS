import React, { useState } from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, type = "button", isLoading, children, disabled, onClick, ...props }, ref) => {
  const [actionPending, setActionPending] = useState(false);
  const loading = Boolean(isLoading || actionPending);

  const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
    if (!onClick || loading) return;
    const result = (onClick as (event: React.MouseEvent<HTMLButtonElement>) => unknown)(event);
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      setActionPending(true);
      Promise.resolve(result).finally(() => setActionPending(false));
    }
  };

  return (
    <button
      ref={ref}
      type={type}
      className={className}
      disabled={loading || disabled}
      onClick={handleClick}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" size={16} style={{ marginRight: '0.5rem' }} />}
      {children}
    </button>
  );
});
Button.displayName = "Button";
