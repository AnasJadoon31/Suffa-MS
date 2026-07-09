import Dexie, { type Table } from "dexie";

import type { AttendanceStatus } from "../data/mockData";

export type OutboxEntry = Readonly<{
  id?: number;
  subject_type: "student" | "teacher";
  subject_id: string;
  session_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  captured_at: string;
  idempotency_key: string;
  check_in?: string;
  check_out?: string;
}>;

export type RefCacheEntry = Readonly<{
  key: string;
  data: unknown;
  fetched_at: string;
}>;

class MmsOfflineDb extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  refCache!: Table<RefCacheEntry, string>;

  constructor() {
    super("mms-offline");
    this.version(1).stores({
      outbox: "++id, subject_type, subject_id, attendance_date, idempotency_key"
    });
    // v2: reference-data cache (timetable, rosters, holidays, …) so read
    // screens survive a fully offline day (§3.4, FR-TT-02).
    this.version(2).stores({
      outbox: "++id, subject_type, subject_id, attendance_date, idempotency_key",
      refCache: "key"
    });
  }
}

export const db = new MmsOfflineDb();
