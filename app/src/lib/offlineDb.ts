import Dexie, { type Table } from "dexie";

import type { AttendanceStatus } from "../data/mockData";

export type OutboxEntry = Readonly<{
  id?: number;
  account_key: string;
  subject_type: "student" | "teacher";
  subject_id: string;
  session_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  captured_at: string;
  idempotency_key: string;
  check_in?: string;
  check_out?: string;
  course_id?: string;
  timetable_slot_id?: string;
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
    // v3: every offline write belongs to one authenticated account. Legacy
    // rows have no account_key and are intentionally ignored.
    this.version(3).stores({
      outbox: "++id, account_key, [account_key+idempotency_key], subject_type, subject_id, attendance_date, idempotency_key",
      refCache: "key"
    });
    // v4 keeps the period scope on every new student-attendance write while
    // retaining legacy queued rows for safe replay.
    this.version(4).stores({
      outbox: "++id, account_key, [account_key+idempotency_key], subject_type, subject_id, attendance_date, course_id, timetable_slot_id, idempotency_key",
      refCache: "key"
    });
  }
}

export const db = new MmsOfflineDb();
