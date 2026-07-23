import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

/**
 * ISS3-019: Shared Pakistan phone-number value object/input
 * 
 * Features:
 * - Fixed +92 prefix
 * - Accepts common local input (03..., 3..., etc.)
 * - Normalizes to E.164 format (+923XXXXXXXX)
 * - Validates length and prefixes
 * - Never double-prefixes
 * - Human-readable display
 */

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (isValid: boolean) => void;
  required?: boolean;
  id?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Normalize a Pakistan phone number to E.164 format (+923XXXXXXXX)
 * 
 * Accepts:
 * - 03XXXXXXXXX (local format with leading zero)
 * - 3XXXXXXXXX (without leading zero)
 * - +923XXXXXXXXX (already in E.164)
 * - 923XXXXXXXXX (without +)
 * 
 * Returns:
 * - E.164 format: +923XXXXXXXXX
 * - Empty string if invalid
 */
export function normalizePakistanPhone(input: string): string {
  if (!input) return "";

  // Remove all non-digit characters except leading +
  let cleaned = input.trim();
  const hasPlus = cleaned.startsWith("+");
  cleaned = cleaned.replace(/\D/g, "");

  // Handle various input formats
  if (hasPlus || cleaned.startsWith("92")) {
    // Already has country code
    if (cleaned.startsWith("92")) {
      cleaned = "+" + cleaned;
    }
    // Validate: +92 followed by 10 digits starting with 3
    if (/^\+923\d{9}$/.test(cleaned)) {
      return cleaned;
    }
    return "";
  } else if (cleaned.startsWith("0")) {
    // Local format with leading zero: 03XXXXXXXXX
    if (/^03\d{9}$/.test(cleaned)) {
      return "+92" + cleaned.substring(1);
    }
    return "";
  } else if (cleaned.startsWith("3")) {
    // Without leading zero: 3XXXXXXXXX
    if (/^3\d{9}$/.test(cleaned)) {
      return "+92" + cleaned;
    }
    return "";
  }

  return "";
}

/**
 * Format E.164 phone number for human-readable display
 * +923001234567 -> +92 300 1234567
 */
export function formatPhoneDisplay(e164: string): string {
  if (!e164 || !e164.startsWith("+92")) return e164;
  
  const number = e164.substring(3); // Remove +92
  if (number.length === 10) {
    return `+92 ${number.substring(0, 3)} ${number.substring(3)}`;
  }
  
  return e164;
}

/**
 * Validate Pakistan phone number
 */
export function isValidPakistanPhone(input: string): boolean {
  if (!input) return false;
  return /^\+923\d{9}$/.test(input);
}

export function PhoneInput({
  value,
  onChange,
  onValidityChange,
  required = false,
  id,
  label,
  placeholder,
  disabled = false,
}: PhoneInputProps) {
  const { t } = useTranslation();
  const [displayValue, setDisplayValue] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);

  // Sync display value with prop value
  useEffect(() => {
    if (value) {
      // Show in local format for editing (without +92 prefix)
      if (value.startsWith("+92")) {
        setDisplayValue("0" + value.substring(3));
      } else {
        setDisplayValue(value);
      }
    } else {
      setDisplayValue("");
    }
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    
    // Allow only digits, spaces, and common phone characters
    const filtered = input.replace(/[^\d\s+\-()]/g, "");
    
    setDisplayValue(filtered);
    setTouched(true);

    // Normalize and validate
    const normalized = normalizePakistanPhone(filtered);
    
    if (filtered && !normalized) {
      setError(t("phoneInvalidError", "Enter a valid Pakistan mobile number"));
      onValidityChange?.(false);
    } else {
      setError("");
      onValidityChange?.(true);
    }

    onChange(normalized);
  };

  const handleBlur = () => {
    setTouched(true);
    if (required && !value) {
      setError(t("requiredField", "This field is required"));
    }
  };

  return (
    <div className="phoneInput">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="phoneInputWrapper">
        <span className="phonePrefix" aria-hidden="true">+92</span>
        <input
          id={id}
          type="tel"
          value={displayValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          placeholder={placeholder || t("phonePlaceholder", "3001234567")}
          disabled={disabled}
          className={`phoneInputField${error && touched ? " invalid" : ""}`}
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          aria-invalid={!!error && touched}
          aria-describedby={error && touched ? `${id}-error` : undefined}
        />
      </div>
      {error && touched && (
        <p id={`${id}-error`} className="phoneInputError" role="alert">
          {error}
        </p>
      )}
      {value && (
        <p className="phoneInputFormatted">
          {formatPhoneDisplay(value)}
        </p>
      )}
    </div>
  );
}