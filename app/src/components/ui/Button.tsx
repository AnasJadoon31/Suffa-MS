import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, type = "button", isLoading, children, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type={type}
      className={className}
      disabled={isLoading || disabled}
      {...props}
    >
      {isLoading && <Loader2 className="animate-spin" size={16} style={{ marginRight: '0.5rem' }} />}
      {children}
    </button>
  );
});
Button.displayName = "Button";
