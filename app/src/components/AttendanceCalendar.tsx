import { Button, PrimaryButton, SecondaryButton, DangerButton, IconButton, TableAction } from "./ui/Button";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export type ClassDayStats = Record<string, { present: number; total: number }>;
export type StudentDayStatus = Record<string, "present" | "absent" | "leave">;
export type HolidayMarkers = Record<string, string>;

interface AttendanceCalendarProps {
  month: Date;
  onMonthChange: (next: Date) => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  mode: "class" | "student";
  classDayStats?: ClassDayStats;
  studentDayStatus?: StudentDayStatus;
  holidayMarkers?: HolidayMarkers;
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function startOfMonth(month: Date): Date {
  return new Date(month.getFullYear(), month.getMonth(), 1);
}

function addMonths(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

export function monthRange(month: Date): { start_date: string; end_date: string } {
  const start = startOfMonth(month);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return { start_date: toDateKey(start), end_date: toDateKey(end) };
}

export function AttendanceCalendar({
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  mode,
  classDayStats = {},
  studentDayStatus = {},
  holidayMarkers = {},
}: Readonly<AttendanceCalendarProps>) {
  const { t, i18n } = useTranslation();
  const today = new Date();
  const todayKey = toDateKey(today);
  const monthStart = startOfMonth(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlanks = monthStart.getDay();
  const weekdayFormatter = new Intl.DateTimeFormat(i18n.language, { weekday: "short" });
  const monthFormatter = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" });
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(new Date(2024, 0, index + 7)));

  const cells: Array<{ key: string; day: number } | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => ({
      key: toDateKey(new Date(month.getFullYear(), month.getMonth(), index + 1)),
      day: index + 1,
    })),
  ];

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5 }}>
        <SecondaryButton
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft size={17} />
        </SecondaryButton>
        <strong>{monthFormatter.format(month)}</strong>
        <SecondaryButton
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label={t("nextMonth")}
        >
          <ChevronRight size={17} />
        </SecondaryButton>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, px: 1.5, pb: 0.5 }}>
        {weekdayLabels.map((label) => (
          <Box key={label} sx={{ textAlign: "center", fontSize: "0.75rem", fontWeight: 600, color: "text.secondary" }}>{label}</Box>
        ))}
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, px: 1.5, pb: 1.5 }}>
        {cells.map((cell, index) => {
          if (!cell) return <span key={`blank-${index}`} />;

          const isFuture = cell.key > todayKey;
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDate;
          const stats = mode === "class" ? classDayStats[cell.key] : undefined;
          const status = mode === "student" ? studentDayStatus[cell.key] : undefined;
          const holidayName = holidayMarkers[cell.key];

          return (
            <SecondaryButton
              type="button"
              key={cell.key}
              disabled={isFuture}
              onClick={() => onSelectDate(cell.key)}
              title={holidayName}
              sx={{
                minHeight: 48,
                flexDirection: "column",
                gap: 0.25,
                backgroundColor: isSelected ? "primary.main" : isToday ? "action.hover" : "transparent",
                color: isSelected ? "primary.contrastText" : "text.primary",
                "&:hover": { backgroundColor: isSelected ? "primary.dark" : "action.hover" },
              }}
            >
              <span>{cell.day}</span>
              {holidayName && (
                <Box component="span" sx={{ fontSize: "0.6rem", color: "warning.main" }}>{t("holidayLabel")}</Box>
              )}
              {mode === "class" && stats && !holidayName && (
                <Box component="span" sx={{ fontSize: "0.6rem" }}>
                  {stats.present}/{stats.total}
                </Box>
              )}
            </SecondaryButton>
          );
        })}
      </Box>
    </Paper>
  );
}
