import { useEffect, useState } from "react";

import { academicsApi } from "./endpoints";

/**
 * Dual-date surfacing (§E): wherever a bare Gregorian date is shown standalone
 * (Holidays list, Attendance calendar, Payment/Salary dates), pair it with its
 * Hijri equivalent using the same `core/hijri.py` conversion the topbar "today"
 * chip already calls (`GET /academics/today`, now also accepting an arbitrary
 * `date`). Conversions are deterministic, so results are cached in memory for
 * the lifetime of the tab — repeated dates (e.g. a payment list) cost one
 * request per unique date, not one per row.
 */
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

async function fetchHijri(day: string): Promise<string> {
  const cached = cache.get(day);
  if (cached) return cached;
  let promise = inflight.get(day);
  if (!promise) {
    promise = academicsApi.today(day).then((r) => r.hijri);
    inflight.set(day, promise);
  }
  try {
    const hijri = await promise;
    cache.set(day, hijri);
    return hijri;
  } finally {
    inflight.delete(day);
  }
}

/** React hook: Hijri equivalent of a Gregorian date (accepts "YYYY-MM-DD" or
 * a full ISO datetime string), or null while loading/unavailable. */
export function useHijri(dateStr: string | null | undefined): string | null {
  const day = dateStr ? dateStr.slice(0, 10) : "";
  const [hijri, setHijri] = useState<string | null>(() => (day ? (cache.get(day) ?? null) : null));

  useEffect(() => {
    if (!day) {
      setHijri(null);
      return;
    }
    const cached = cache.get(day);
    if (cached) {
      setHijri(cached);
      return;
    }
    let cancelled = false;
    void fetchHijri(day)
      .then((h) => {
        if (!cancelled) setHijri(h);
      })
      .catch(() => {
        if (!cancelled) setHijri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [day]);

  return hijri;
}
