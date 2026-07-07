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

class MmsOfflineDb extends Dexie {
  outbox!: Table<OutboxEntry, number>;

  constructor() {
    super("mms-offline");
    this.version(1).stores({
      outbox: "++id, subject_type, subject_id, attendance_date, idempotency_key"
    });
  }
}

export const db = new MmsOfflineDb();
