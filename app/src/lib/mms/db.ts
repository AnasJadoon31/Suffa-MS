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

export interface MutationEntry {
  id?: number;
  idempotency_key: string;
  method: string;
  url: string;
  data: unknown;
  headers: Record<string, string>;
  created_at: string;
  attempts: number;
  status: "pending" | "syncing" | "failed";
  error?: string;
}

export class MmsDatabase extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  rosterCache!: Table<RosterCache, string>;
  mutations!: Table<MutationEntry, number>;

  constructor() {
    super("mms-offline");
    this.version(2).stores({
      outbox: "++id, idempotency_key, created_at, attempts",
      rosterCache: "key, cached_at",
      mutations: "++id, idempotency_key, created_at, attempts, status",
    });
  }
}

export const db = new MmsDatabase();
