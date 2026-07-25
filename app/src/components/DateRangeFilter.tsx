import { useMemo } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "./ui/Button";
import { Input } from "./ui/Field";
import { DATE_RANGE_PRESETS, presetRange } from "../lib/dateRanges";

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
    <div className="dateRangeFilter">
      <div className="quickRangeButtons" aria-label={t("quickRangesLabel")}>
        {DATE_RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            className={activePreset === preset.id ? "primaryAction" : "secondaryAction"}
            type="button"
            aria-pressed={activePreset === preset.id}
            onClick={() => onChange(presetRange(preset.id, timezone))}
          >
            {t(`datePreset_${preset.id}`)}
          </Button>
        ))}
      </div>
      <div className="dateRangeFields">
        <label>{t("fromLabel")}<Input type="date" value={from} onChange={(event) => onChange({ from: event.target.value, to })} /></label>
        <label>{t("toLabel")}<Input type="date" value={to} onChange={(event) => onChange({ from, to: event.target.value })} /></label>
        {children}
      </div>
    </div>
  );
}
