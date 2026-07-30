import React from "react";
import MuiCheckbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import NativeSelect from "@mui/material/NativeSelect";
import MuiRadio from "@mui/material/Radio";
import TextField from "@mui/material/TextField";

const MUITextField = TextField as any;
const MUICheckbox = MuiCheckbox as any;
const MUIFormControl = FormControl as any;
const MUINativeSelect = NativeSelect as any;
const MUIRadio = MuiRadio as any;

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
};
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, onClick, startAdornment, endAdornment, size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  const { ["aria-label"]: ariaLabel, ["aria-describedby"]: ariaDescribedBy, ["aria-invalid"]: ariaInvalid, ...textFieldProps } = props;
  return (
    <MUITextField
      inputRef={ref}
      className={`mms-input ${className || ""}`}
      variant="outlined"
      size="small"
      fullWidth
      sx={{
        "& .MuiInputBase-root": {
          minHeight: 60,
        },
        "& .MuiInputBase-input": {
          boxSizing: "border-box",
          minHeight: 58,
          height: 58,
          paddingBlock: "10px",
          lineHeight: 1.35,
          overflow: "visible",
        },
      }}
      {...textFieldProps}
      InputProps={{
        startAdornment: startAdornment ? <InputAdornment position="start">{startAdornment}</InputAdornment> : undefined,
        endAdornment: endAdornment ? <InputAdornment position="end">{endAdornment}</InputAdornment> : undefined,
      }}
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
            minHeight: 44,
            height: "auto",
            padding: "10px 36px 10px 12px",
            lineHeight: 1.45,
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
      sx={{
        color: "var(--muted)",
        width: 44,
        height: 44,
        padding: "10px",
        flex: "0 0 44px",
        "&.Mui-checked": {
          color: "var(--accent)",
        },
        "& .MuiSvgIcon-root": {
          fontSize: 22,
        },
      }}
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";

type CheckboxFieldProps = CheckboxProps & {
  label: React.ReactNode;
  checkboxClassName?: string;
};

export const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(({ className, checkboxClassName, label, title, ...props }, ref) => {
  return (
    <label className={`checkboxLabel checkboxField ${className || ""}`.trim()} title={title}>
      <Checkbox ref={ref} className={checkboxClassName} {...props} />
      <span className="checkboxFieldText">{label}</span>
    </label>
  );
});
CheckboxField.displayName = "CheckboxField";

type RadioProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(({ className, size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  return (
    <MUIRadio
      ref={ref}
      size="small"
      className={className}
      sx={{
        color: "var(--muted)",
        width: 44,
        height: 44,
        padding: "10px",
        flex: "0 0 44px",
        "&.Mui-checked": {
          color: "var(--accent)",
        },
        "& .MuiSvgIcon-root": {
          fontSize: 22,
        },
      }}
      {...props}
    />
  );
});
Radio.displayName = "Radio";

type RadioFieldProps = RadioProps & {
  label: React.ReactNode;
  radioClassName?: string;
};

export const RadioField = React.forwardRef<HTMLInputElement, RadioFieldProps>(({ className, radioClassName, label, title, ...props }, ref) => {
  return (
    <label className={`choiceLabel radioField ${className || ""}`.trim()} title={title}>
      <Radio ref={ref} className={radioClassName} {...props} />
      <span className="choiceFieldText">{label}</span>
    </label>
  );
});
RadioField.displayName = "RadioField";
