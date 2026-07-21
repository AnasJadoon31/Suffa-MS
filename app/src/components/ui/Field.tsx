import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={`mms-input ${className || ""}`}
      {...props}
      onClick={(e) => {
        if (props.type === "date" && "showPicker" in e.target) {
          try { (e.target as HTMLInputElement).showPicker(); } catch (err) {}
        }
        props.onClick?.(e);
      }}
    />
  );
});
Input.displayName = "Input";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={`mms-input ${className || ""}`}
      {...props}
    />
  );
});
Select.displayName = "Select";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={`mms-input ${className || ""}`}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, ...props }, ref) => {
  return (
    <input
      type="checkbox"
      ref={ref}
      className={className}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";

type RadioProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(({ className, ...props }, ref) => {
  return (
    <input
      type="radio"
      ref={ref}
      className={className}
      {...props}
    />
  );
});
Radio.displayName = "Radio";
