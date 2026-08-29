import Dexie, { type Table } from "dexie";
import type { AttendanceSyncEntry } from "./endpoints";

export interface OutboxEntry {
  id?: number;
  idempotency_key: string;
  entry: AttendanceSyncEntry;
  created_at: string;
  attempts: number;
  // Absent on rows written before this field existed — treated as "pending".
  // See MutationEntry.syncing_at below for what "syncing"/syncing_at mean.
  // "rejected" (added alongside MutationEntry's) means the server
  // permanently refused this entry — a locked day, an invalid reference —
  // and it will not be retried automatically.
  status?: "pending" | "syncing" | "failed" | "rejected";
  error?: string;
  syncing_at?: string;
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
  // "rejected" means the server has permanently refused this request (a 4xx
  // that isn't a timeout/rate-limit) — retrying it will fail identically
  // forever, so it's excluded from automatic retry once marked this way.
  status: "pending" | "syncing" | "failed" | "rejected";
  error?: string;
  // Set when status transitions to "syncing". Lets a concurrent flush (e.g.
  // the same PWA open in a second tab, sharing this IndexedDB) tell "another
  // tab is actively sending this right now" apart from "a previous flush
  // crashed mid-request" — see mutationQueue.ts's STALE_SYNC_MS.
  syncing_at?: string;
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
