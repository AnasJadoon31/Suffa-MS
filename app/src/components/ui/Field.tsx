import React, { useId, useState } from "react";
import MuiCheckbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import InputAdornment from "@mui/material/InputAdornment";
import NativeSelect from "@mui/material/NativeSelect";
import MuiRadio from "@mui/material/Radio";
import TextField from "@mui/material/TextField";
import MuiButton from "@mui/material/Button";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled, type SxProps } from "@mui/material/styles";
import { Upload } from "lucide-react";

const MUITextField = TextField as any;
const MUIButton = MuiButton as any;
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

const FileInputRoot = styled(Box)(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  gap: theme.spacing(1),
  alignItems: "center",
  width: "100%",
  minWidth: 0,
  [theme.breakpoints.down("sm")]: {
    gridTemplateColumns: "1fr",
  },
}));

const FileInputButton = styled(MUIButton)(({ theme }) => ({
  minHeight: 44,
  borderRadius: 8,
  textTransform: "none",
  fontWeight: 700,
  justifyContent: "center",
  whiteSpace: "nowrap",
  [theme.breakpoints.down("sm")]: {
    width: "100%",
  },
}));

const FileInputName = styled(Typography)(({ theme }) => ({
  minWidth: 0,
  color: theme.palette.text.secondary,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  [theme.breakpoints.down("sm")]: {
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
}));

export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "color"> & {
  label?: React.ReactNode;
  fullWidth?: boolean;
  sx?: SxProps;
  error?: boolean;
  helperText?: React.ReactNode;
  slotProps?: {
    input?: Record<string, unknown>;
    htmlInput?: Record<string, unknown>;
  };
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
};
export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ onClick, startAdornment, endAdornment, fullWidth = true, ...props }, ref) => {
  const { ["aria-label"]: ariaLabel, ["aria-describedby"]: ariaDescribedBy, ["aria-invalid"]: ariaInvalid, accept, slotProps, ...textFieldProps } = props;
  return (
    <StyledTextField
      inputRef={ref}
      variant="outlined"
      size="small"
      fullWidth={fullWidth}
      {...textFieldProps}
      slotProps={{
        input: {
          ...slotProps?.input,
          startAdornment: startAdornment ? <InputAdornment position="start">{startAdornment}</InputAdornment> : slotProps?.input?.startAdornment,
          endAdornment: endAdornment ? <InputAdornment position="end">{endAdornment}</InputAdornment> : slotProps?.input?.endAdornment,
        },
        htmlInput: {
          ...slotProps?.htmlInput,
          "aria-label": ariaLabel,
          "aria-describedby": ariaDescribedBy,
          "aria-invalid": ariaInvalid,
          accept,
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

export const TextInput = Input;

export const SearchInput = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>((props, ref) => (
  <Input ref={ref} type="search" {...props} />
));
SearchInput.displayName = "SearchInput";

export const DateInput = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>((props, ref) => (
  <Input ref={ref} type="date" {...props} />
));
DateInput.displayName = "DateInput";

export const NumberInput = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>((props, ref) => (
  <Input ref={ref} type="number" {...props} />
));
NumberInput.displayName = "NumberInput";

type FileInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  buttonLabel: React.ReactNode;
  emptyLabel?: React.ReactNode;
  selectedLabel?: React.ReactNode;
  helperText?: React.ReactNode;
  onFileChange?: (file: File | null, files: FileList | null) => void;
};

export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(({
  id,
  buttonLabel,
  emptyLabel = "No file selected",
  selectedLabel,
  helperText,
  disabled,
  onChange,
  onFileChange,
  className,
  ...props
}, ref) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [fileName, setFileName] = useState("");
  const label = selectedLabel ?? fileName ?? emptyLabel;

  return (
    <FileInputRoot className={className}>
      <FileInputButton
        component="label"
        htmlFor={inputId}
        variant="outlined"
        disabled={disabled}
        startIcon={<Upload size={16} aria-hidden="true" />}
      >
        {buttonLabel}
      </FileInputButton>
      <FileInputName variant="body2" title={typeof label === "string" ? label : undefined}>
        {label}
      </FileInputName>
      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ gridColumn: "1 / -1" }}>
          {helperText}
        </Typography>
      )}
      <input
        ref={ref}
        id={inputId}
        type="file"
        disabled={disabled}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          setFileName(file?.name ?? "");
          onFileChange?.(file, event.target.files);
          onChange?.(event);
        }}
        {...props}
      />
    </FileInputRoot>
  );
});
FileInput.displayName = "FileInput";

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

export const CheckboxField = React.forwardRef<HTMLInputElement, CheckboxFieldProps>(({ checkboxClassName, label, title, className, ...props }, ref) => {
  return (
    <Box component="label" className={`checkboxLabel${className ? ` ${className}` : ""}`} sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }} title={title}>
      <Checkbox ref={ref} className={checkboxClassName} {...props} />
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
