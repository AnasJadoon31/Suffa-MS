import React from "react";
import MuiCheckbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import NativeSelect from "@mui/material/NativeSelect";
import MuiRadio from "@mui/material/Radio";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";

const MUITextField = TextField as any;
const MUICheckbox = MuiCheckbox as any;
const MUIFormControl = FormControl as any;
const MUINativeSelect = NativeSelect as any;
const MUIRadio = MuiRadio as any;

const StyledTextField = styled(MUITextField)(({ theme }) => ({
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
}));

const StyledSelect = styled(MUIFormControl)(({ theme }) => ({
  "& .MuiNativeSelect-select": {
    boxSizing: "border-box",
    minHeight: 44,
    height: "auto",
    padding: "10px 36px 10px 12px",
    lineHeight: 1.45,
    overflow: "visible",
  },
}));

const StyledCheckbox = styled(MUICheckbox)(({ theme }) => ({
  color: theme.palette.text.secondary,
  width: 44,
  height: 44,
  padding: "10px",
  flex: "0 0 44px",
  "&.Mui-checked": {
    color: theme.palette.primary.main,
  },
  "& .MuiSvgIcon-root": {
    fontSize: 22,
  },
}));

const StyledRadio = styled(MUIRadio)(({ theme }) => ({
  color: theme.palette.text.secondary,
  width: 44,
  height: 44,
  padding: "10px",
  flex: "0 0 44px",
  "&.Mui-checked": {
    color: theme.palette.primary.main,
  },
  "& .MuiSvgIcon-root": {
    fontSize: 22,
  },
}));

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
};
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ onClick, startAdornment, endAdornment, size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  const { ["aria-label"]: ariaLabel, ["aria-describedby"]: ariaDescribedBy, ["aria-invalid"]: ariaInvalid, ...textFieldProps } = props;
  return (
    <StyledTextField
      inputRef={ref}
      variant="outlined"
      size="small"
      fullWidth
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
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ children, size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  const { id, name, required, disabled, ["aria-label"]: ariaLabel, ...selectProps } = props;
  return (
    <StyledSelect
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
        }}
      >
      {children}
      </MUINativeSelect>
    </StyledSelect>
  );
});
Select.displayName = "Select";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ color: _nativeColor, ...props }, ref) => {
  const { ["aria-label"]: ariaLabel, ["aria-describedby"]: ariaDescribedBy, ["aria-invalid"]: ariaInvalid, ...textFieldProps } = props;
  return (
    <MUITextField
      inputRef={ref}
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
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({ size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  return (
    <StyledCheckbox
      ref={ref}
      size="small"
      {...props}
    />
  );
});
Checkbox.displayName = "Checkbox";

type CheckboxFieldProps = CheckboxProps & {
  label: React.ReactNode;
  checkboxClassName?: string;
};

export const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(({ checkboxClassName, label, title, ...props }, ref) => {
  return (
    <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }} title={title}>
      <Checkbox ref={ref} {...props} />
      <Box component="span" sx={{ userSelect: "none" }}>{label}</Box>
    </Box>
  );
});
CheckboxField.displayName = "CheckboxField";

type RadioProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(({ size: _nativeSize, color: _nativeColor, ...props }, ref) => {
  return (
    <StyledRadio
      ref={ref}
      size="small"
      {...props}
    />
  );
});
Radio.displayName = "Radio";

type RadioFieldProps = RadioProps & {
  label: React.ReactNode;
  radioClassName?: string;
};

export const RadioField = React.forwardRef<HTMLInputElement, RadioFieldProps>(({ radioClassName, label, title, ...props }, ref) => {
  return (
    <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }} title={title}>
      <Radio ref={ref} {...props} />
      <Box component="span" sx={{ userSelect: "none" }}>{label}</Box>
    </Box>
  );
});
RadioField.displayName = "RadioField";
