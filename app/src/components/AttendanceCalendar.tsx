import { Button } from "./ui/Button";
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
    <div className="attendanceCalendar">
      <div className="attendanceCalendarNav">
        <Button
          className="secondaryAction"
          type="button"
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft size={17} />
        </Button>
        <strong>{monthFormatter.format(month)}</strong>
        <Button
          className="secondaryAction"
          type="button"
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label={t("nextMonth")}
        >
          <ChevronRight size={17} />
        </Button>
      </div>
      <div className="attendanceCalendarWeekdays">
        {weekdayLabels.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="attendanceCalendarGrid">
        {cells.map((cell, index) => {
          if (!cell) return <span className="attendanceCalendarDay blank" key={`blank-${index}`} />;

          const isFuture = cell.key > todayKey;
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDate;
          const stats = mode === "class" ? classDayStats[cell.key] : undefined;
          const status = mode === "student" ? studentDayStatus[cell.key] : undefined;
          const holidayName = holidayMarkers[cell.key];
          const classNames = [
            "attendanceCalendarDay",
            isFuture && "future",
            isToday && "today",
            isSelected && "selected",
            holidayName && "holiday",
            status ? status : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <Button
              className={classNames}
              type="button"
              key={cell.key}
              disabled={isFuture}
              onClick={() => onSelectDate(cell.key)}
              title={holidayName}
            >
              <span className="attendanceCalendarDayNumber">{cell.day}</span>
              {holidayName && (
                <span className="attendanceCalendarDayHoliday">{t("holidayLabel")}</span>
              )}
              {mode === "class" && stats && !holidayName && (
                <span className="attendanceCalendarDayStat">
                  {stats.present}/{stats.total}
                </span>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
