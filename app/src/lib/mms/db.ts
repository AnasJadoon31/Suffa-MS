import Dexie, { type Table } from "dexie";
import type { AttendanceSyncEntry } from "./endpoints";

export interface OutboxEntry {
  id?: number;
  idempotency_key: string;
  entry: AttendanceSyncEntry;
  created_at: string;
  attempts: number;
}

export interface RosterCache {
  key: string;
  data: unknown;
  cached_at: string;
}

export class MmsDatabase extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  rosterCache!: Table<RosterCache, string>;

  constructor() {
    super("mms-offline");
    this.version(1).stores({
      outbox: "++id, idempotency_key, created_at, attempts",
      rosterCache: "key, cached_at",
    });
  }
}

export const db = new MmsDatabase();
