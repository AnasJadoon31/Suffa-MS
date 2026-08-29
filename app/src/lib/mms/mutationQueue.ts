import { api, readToken, readTenant } from "./api";
import { db } from "./db";

const MUTATION_METHODS = new Set(["post", "put", "patch", "delete"]);

export interface QueuedMutation {
  idempotency_key: string;
  method: string;
  url: string;
  data: unknown;
  headers: Record<string, string>;
  created_at: string;
  attempts: number;
  status: "pending" | "syncing" | "failed";
  error?: string;
  syncing_at?: string;
}

function generateKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueMutation(method: string, url: string, data: unknown): Promise<string> {
  const key = generateKey();
  await db.mutations.add({
    idempotency_key: key,
    method: method.toUpperCase(),
    url,
    data,
    headers: {},
    created_at: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  });
  return key;
}

// "syncing" is set right before the network call and cleared (removed, or
// set to "failed") right after — normally resolved within the same
// flushMutations() call. Two situations leave an entry sitting on "syncing"
// across calls, and they need opposite treatment:
//  - a crash/reload mid-flush: stuck forever unless something retries it.
//  - a genuine race with another flush already in flight for this same
//    entry — most commonly the same PWA open in a second tab, since both
//    tabs' useMutationSync() instances share this one IndexedDB database.
//    Re-sending here too would submit the change twice.
// A "syncing" entry only counts as pending/recoverable once it's older than
// this — long enough that no real in-flight request is still running, short
// enough that a genuinely stuck entry doesn't sit invisible for long.
const STALE_SYNC_MS = 30_000;

function isRecoverable(entry: QueuedMutation): boolean {
  if (entry.status === "pending" || entry.status === "failed") return true;
  if (entry.status !== "syncing") return false;
  const syncingSince = entry.syncing_at ? Date.parse(entry.syncing_at) : 0;
  return !Number.isFinite(syncingSince) || Date.now() - syncingSince > STALE_SYNC_MS;
}

async function getRecoverableMutations(): Promise<QueuedMutation[]> {
  const all = await db.mutations.orderBy("created_at").toArray();
  return all.filter(isRecoverable);
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  return getRecoverableMutations();
}

export async function getMutationCount(): Promise<number> {
  return (await getRecoverableMutations()).length;
}

export async function removeMutation(key: string): Promise<void> {
  await db.mutations.where("idempotency_key").equals(key).delete();
}

// Marks a claimed entry as failed after a send attempt. claimMutation()
// already counted the attempt, so this only updates status/error.
export async function markMutationFailed(key: string, error: string): Promise<void> {
  const entry = await db.mutations.where("idempotency_key").equals(key).first();
  if (entry?.id != null) {
    await db.mutations.update(entry.id, { status: "failed", error });
  }
}

// Atomically transitions one entry to "syncing" so two concurrent flushes
// (two tabs, most commonly) can't both start sending the same mutation.
// IndexedDB serializes readwrite transactions against the same object store
// across every tab/context with the database open, so the read-then-write
// here is safe even though the two calls originate in different tabs.
async function claimMutation(id: number): Promise<QueuedMutation | undefined> {
  return db.transaction("rw", db.mutations, async () => {
    const entry = await db.mutations.get(id);
    if (!entry || !isRecoverable(entry)) return undefined;
    const claimed: Partial<QueuedMutation> = {
      status: "syncing",
      syncing_at: new Date().toISOString(),
      attempts: entry.attempts + 1,
    };
    await db.mutations.update(id, claimed);
    return { ...entry, ...claimed };
  });
}

export async function flushMutations(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const candidates = await db.mutations.orderBy("created_at").toArray();
  if (!candidates.length) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (candidate.id == null) continue;
    const entry = await claimMutation(candidate.id);
    if (!entry) continue; // not recoverable, or another tab just claimed it

    try {
      const token = readToken();
      const tenant = readTenant();
      await api.request({
        method: entry.method,
        url: entry.url,
        data: entry.data,
        headers: {
          Authorization: token ? `Bearer ${token}` : undefined,
          "X-Madrasa": tenant,
          // Lets the backend dedupe a resend of an entry it already
          // processed (a client crash between the server committing and
          // removeMutation() completing) instead of applying it twice.
          "Idempotency-Key": entry.idempotency_key,
        },
      });
      await removeMutation(entry.idempotency_key);
      synced++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed";
      await markMutationFailed(entry.idempotency_key, message);
      failed++;
    }
  }

  const remaining = await getMutationCount();
  return { synced, failed, remaining };
}

export function isMutationRequest(method: string | undefined): boolean {
  return !!method && MUTATION_METHODS.has(method.toLowerCase());
}
