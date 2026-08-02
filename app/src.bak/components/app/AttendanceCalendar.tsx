import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type ClassDayStats = Record<string, { present: number; total: number }>;
export type StudentDayStatus = Record<string, "present" | "absent" | "leave">;
export type HolidayMarkers = Record<string, string>;

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function startOfMonth(month: Date): Date {
  return new Date(month.getFullYear(), month.getMonth(), 1);
}

export function addMonths(month: Date, delta: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + delta, 1);
}

export function monthRange(month: Date): { start_date: string; end_date: string } {
  const start = startOfMonth(month);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return { start_date: toDateKey(start), end_date: toDateKey(end) };
}

export function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function AttendanceCalendar({
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  mode,
  classDayStats = {},
  studentDayStatus = {},
  holidayMarkers = {},
}: {
  month: Date;
  onMonthChange: (next: Date) => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  mode: "class" | "student";
  classDayStats?: ClassDayStats;
  studentDayStatus?: StudentDayStatus;
  holidayMarkers?: HolidayMarkers;
}) {
  const todayKey = toDateKey(new Date());
  const monthStart = startOfMonth(month);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = (monthStart.getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      toDateKey(new Date(month.getFullYear(), month.getMonth(), index + 1)),
    ),
  ];

  return (
    <div className="card-surface p-3">
      <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <button
          aria-label="Previous month"
          onClick={() => onMonthChange(addMonths(month, -1))}
          className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-center font-display text-sm font-extrabold">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <button
          aria-label="Next month"
          onClick={() => onMonthChange(addMonths(month, 1))}
          className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((key, index) => {
          if (!key) return <span key={`empty-${index}`} />;
          const day = Number(key.slice(-2));
          const isFuture = key > todayKey;
          const holiday = holidayMarkers[key];
          const stats = classDayStats[key];
          const status = studentDayStatus[key];
          const ratio = stats && stats.total > 0 ? stats.present / stats.total : null;

          let tone = "bg-muted/60 text-muted-foreground";
          if (holiday) tone = "bg-accent-soft text-accent-foreground";
          if (mode === "student" && status === "present")
            tone = "bg-success text-success-foreground";
          if (mode === "student" && status === "absent")
            tone = "bg-destructive text-destructive-foreground";
          if (mode === "student" && status === "leave") tone = "bg-accent text-accent-foreground";
          if (mode === "class" && ratio !== null) {
            tone =
              ratio >= 0.9
                ? "bg-success text-success-foreground"
                : ratio >= 0.6
                  ? "bg-accent text-accent-foreground"
                  : "bg-destructive text-destructive-foreground";
          }

          return (
            <button
              key={key}
              title={holiday ?? undefined}
              disabled={isFuture}
              onClick={() => onSelectDate(key)}
              className={cn(
                "relative grid aspect-square place-items-center rounded-xl text-xs font-bold transition-transform active:scale-95",
                tone,
                isFuture && "opacity-35",
                key === todayKey && "ring-1 ring-primary",
                key === selectedDate && "ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
            >
              {day}
              {mode === "class" && stats ? (
                <span className="absolute bottom-0.5 text-[0.5rem] font-semibold opacity-80">
                  {stats.present}/{stats.total}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
