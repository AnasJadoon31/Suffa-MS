import { useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";

import { Button } from "./ui/Button";
import { Input } from "./ui/Field";
import { DATE_RANGE_PRESETS, presetRange } from "../lib/dateRanges";

const FilterWrapper = styled("div")({
  display: "flex",
  flexDirection: "column",
  gap: 12,
});

const QuickRangeButtons = styled("div")({
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
});

const DateRangeFields = styled("div")({
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "flex-end",
});

const FieldLabel = styled("label")({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: "0.875rem",
});

export function DateRangeFilter({
  from,
  to,
  onChange,
  timezone,
  children,
}: Readonly<{
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  timezone: string;
  children?: ReactNode;
}>) {
  const { t } = useTranslation();
  const activePreset = useMemo(
    () => DATE_RANGE_PRESETS.find((preset) => {
      const range = presetRange(preset.id, timezone);
      return range.from === from && range.to === to;
    })?.id,
    [from, timezone, to],
  );

  return (
    <FilterWrapper>
      <QuickRangeButtons aria-label={t("quickRangesLabel")}>
        {DATE_RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            aria-pressed={activePreset === preset.id}
            onClick={() => onChange(presetRange(preset.id, timezone))}
          >
            {t(`datePreset_${preset.id}`)}
          </Button>
        ))}
      </QuickRangeButtons>
      <DateRangeFields>
        <FieldLabel>{t("fromLabel")}<Input type="date" value={from} onChange={(event) => onChange({ from: event.target.value, to })} /></FieldLabel>
        <FieldLabel>{t("toLabel")}<Input type="date" value={to} onChange={(event) => onChange({ from, to: event.target.value })} /></FieldLabel>
        {children}
      </DateRangeFields>
    </FilterWrapper>
  );
}
