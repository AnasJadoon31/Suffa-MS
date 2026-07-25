export type DateRangePreset = "week" | "month" | "quarter" | "halfYear" | "year";

export const DATE_RANGE_PRESETS: Array<{ id: DateRangePreset; months?: number; days?: number }> = [
  { id: "week", days: 7 },
  { id: "month", months: 1 },
  { id: "quarter", months: 3 },
  { id: "halfYear", months: 6 },
  { id: "year", months: 12 },
];

function isoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function dateInTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function presetRange(preset: DateRangePreset, timezone: string, now = new Date()): { from: string; to: string } {
  const to = dateInTimezone(now, timezone);
  const [year, month, day] = to.split("-").map(Number);
  const definition = DATE_RANGE_PRESETS.find((item) => item.id === preset)!;
  if (definition.days) {
    const start = new Date(Date.UTC(year, month - 1, day - (definition.days - 1)));
    return { from: isoDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()), to };
  }
  const targetMonth = month - 1 - (definition.months ?? 0);
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return { from: isoDate(targetYear, normalizedMonth, Math.min(day, lastDay)), to };
}
