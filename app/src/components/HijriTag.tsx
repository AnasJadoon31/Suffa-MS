import { useHijri } from "../lib/hijri";

/** Small dual-date tag: Hijri equivalent shown under/next to a bare Gregorian
 * date (§E dual-date surfacing — Holidays, Attendance, Payment/Salary). */
export function HijriTag({ date, inline = false }: Readonly<{ date: string; inline?: boolean }>) {
  const hijri = useHijri(date);
  if (!hijri) return null;
  return (
    <small className="notice hijriTag" style={inline ? { marginInlineStart: 6 } : { display: "block" }}>
      {hijri}
    </small>
  );
}
