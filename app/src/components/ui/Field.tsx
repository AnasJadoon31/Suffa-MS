import React from "react";
import MuiCheckbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import NativeSelect from "@mui/material/NativeSelect";
import MuiRadio from "@mui/material/Radio";
import TextField from "@mui/material/TextField";

const MUITextField = TextField as any;
const MUICheckbox = MuiCheckbox as any;
const MUIFormControl = FormControl as any;
const MUINativeSelect = NativeSelect as any;
const MUIRadio = MuiRadio as any;

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, onClick, size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  const { ["aria-label"]: ariaLabel, ["aria-describedby"]: ariaDescribedBy, ["aria-invalid"]: ariaInvalid, ...textFieldProps } = props;
  return (
    <MUITextField
      inputRef={ref}
      className={`mms-input ${className || ""}`}
      variant="outlined"
      size="small"
      fullWidth
      {...textFieldProps}
      slotProps={{
        htmlInput: {
          "aria-label": ariaLabel,
          "aria-describedby": ariaDescribedBy,
          "aria-invalid": ariaInvalid,
          accept: textFieldProps.accept,
        },
      }}
      onClick={(e: React.MouseEvent<HTMLInputElement>) => {
        if (textFieldProps.type === "date" && "showPicker" in e.target) {
          try { (e.target as HTMLInputElement).showPicker(); } catch (err) {}
        }
        onClick?.(e as React.MouseEvent<HTMLInputElement>);
      }}
    />
  );
});
Input.displayName = "Input";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  const { id, name, required, disabled, ["aria-label"]: ariaLabel, ...selectProps } = props;
  return (
    <MUIFormControl
      className={`mms-input ${className || ""}`}
      size="small"
      variant="outlined"
      fullWidth
      required={required}
      disabled={disabled}
    >
      <MUINativeSelect
        inputRef={ref}
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        inputProps={{
          id,
          name,
          required,
          disabled,
          "aria-label": ariaLabel,
        }}
        {...selectProps}
        sx={{
          minHeight: 48,
          "& .MuiNativeSelect-select": {
            boxSizing: "border-box",
            minHeight: 34,
            height: "auto",
            padding: "12px 36px 12px 12px",
            lineHeight: 1.7,
            overflow: "visible",
          },
        }}
      >
      {children}
      </MUINativeSelect>
    </MUIFormControl>
  );
});
Select.displayName = "Select";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, color: _nativeColor, ...props }, ref) => {
  const { ["aria-label"]: ariaLabel, ["aria-describedby"]: ariaDescribedBy, ["aria-invalid"]: ariaInvalid, ...textFieldProps } = props;
  return (
    <MUITextField
      inputRef={ref}
      className={`mms-input ${className || ""}`}
      variant="outlined"
      size="small"
      fullWidth
      multiline
      {...textFieldProps}
      slotProps={{
        htmlInput: {
          "aria-label": ariaLabel,
          "aria-describedby": ariaDescribedBy,
          "aria-invalid": ariaInvalid,
        },
      }}
    />
  );
});
Textarea.displayName = "Textarea";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ className, size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  return (
    <MUICheckbox
      ref={ref}
      size="small"
      className={className}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";

type RadioProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(({ className, size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  return (
    <MUIRadio
      ref={ref}
      size="small"
      className={className}
      {...props}
    />
  );
});
Radio.displayName = "Radio";
