import { db, type OutboxEntry } from "./db";
import { attendanceApi, type AttendanceSyncEntry } from "./endpoints";
import { isPermanentRejection } from "./mutationQueue";

export async function enqueueEntry(entry: AttendanceSyncEntry): Promise<number> {
  return db.outbox.add({
    idempotency_key: entry.idempotency_key,
    entry,
    created_at: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  });
}

// Same reasoning as mutationQueue.ts's STALE_SYNC_MS: "syncing" only counts
// as recoverable once it's old enough that no real in-flight batch could
// still be running — otherwise a second tab's flush would resend the same
// attendance entries a currently-in-flight flush (from either tab) is
// already sending.
const STALE_SYNC_MS = 30_000;

// "rejected" is deliberately excluded and stays excluded — see the matching
// comment in mutationQueue.ts's isRecoverable.
function isRecoverable(entry: OutboxEntry): boolean {
  if (entry.status == null || entry.status === "pending" || entry.status === "failed") return true;
  if (entry.status === "rejected") return false;
  const syncingSince = entry.syncing_at ? Date.parse(entry.syncing_at) : 0;
  return !Number.isFinite(syncingSince) || Date.now() - syncingSince > STALE_SYNC_MS;
}

async function getRecoverableEntries(): Promise<OutboxEntry[]> {
  const all = await db.outbox.orderBy("created_at").toArray();
  return all.filter(isRecoverable);
}

export async function outboxCount(): Promise<number> {
  return (await getRecoverableEntries()).length;
}

// Plain scan + in-memory filter, not an indexed .where("status") query:
// "status" isn't in the outbox store's index list (unlike mutations, which
// has it from the start), and the outbox is small enough — a handful of
// queued attendance batches at most — that this costs nothing measurable.
export async function getRejectedOutboxEntries(): Promise<OutboxEntry[]> {
  const all = await db.outbox.orderBy("created_at").toArray();
  return all.filter((e) => e.status === "rejected");
}

export async function getRejectedOutboxCount(): Promise<number> {
  return (await getRejectedOutboxEntries()).length;
}

export async function removeFromOutbox(idempotencyKeys: string[]): Promise<void> {
  if (!idempotencyKeys.length) return;
  await db.outbox.where("idempotency_key").anyOf(idempotencyKeys).delete();
}

export const discardRejectedOutboxEntry = (key: string) => removeFromOutbox([key]);

export async function discardAllRejectedOutboxEntries(): Promise<void> {
  const rejected = await getRejectedOutboxEntries();
  await removeFromOutbox(rejected.map((e) => e.idempotency_key));
}

async function markOutboxFailed(
  idempotencyKeys: string[],
  status: "failed" | "rejected" = "failed",
  error?: string,
): Promise<void> {
  if (!idempotencyKeys.length) return;
  const entries = await db.outbox.where("idempotency_key").anyOf(idempotencyKeys).toArray();
  await db.transaction("rw", db.outbox, async () => {
    for (const e of entries) {
      if (e.id != null) await db.outbox.update(e.id, { status, error });
    }
  });
}

// Atomically claims every currently-recoverable entry in one transaction so
// a concurrent flush (typically the same PWA open in a second tab, sharing
// this IndexedDB) can't also pick up and resend the same batch. IndexedDB
// serializes conflicting readwrite transactions against the same object
// store across every tab/context with the database open, so this holds even
// though the two calls originate in different tabs.
async function claimOutboxBatch(): Promise<OutboxEntry[]> {
  return db.transaction("rw", db.outbox, async () => {
    const claimable = (await db.outbox.orderBy("created_at").toArray()).filter(isRecoverable);
    const syncing_at = new Date().toISOString();
    await Promise.all(
      claimable
        .filter((e) => e.id != null)
        .map((e) =>
          db.outbox.update(e.id!, { status: "syncing", syncing_at, attempts: e.attempts + 1 }),
        ),
    );
    return claimable.map((e) => ({ ...e, status: "syncing" as const, syncing_at }));
  });
}

export async function flushOutbox(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const entries = await claimOutboxBatch();
  if (!entries.length) return { synced: 0, failed: 0, remaining: 0 };

  const syncEntries = entries.map((e) => e.entry);
  const keys = entries.map((e) => e.idempotency_key);

  try {
    const result = await attendanceApi.sync(syncEntries);
    const savedKeys = result.idempotency_keys ?? keys;
    await removeFromOutbox(savedKeys);
    // Claimed but not acknowledged — the backend's own locked_keys/permission
    // checks, a permanent rejection (a locked day needs the explicit
    // /override endpoint, not a retry) — surface as rejected immediately
    // rather than leaving them on "syncing" until STALE_SYNC_MS passes, or
    // retrying a request that will fail identically forever.
    const unsavedKeys = keys.filter((k) => !savedKeys.includes(k));
    await markOutboxFailed(
      unsavedKeys,
      "rejected",
      "Rejected by server (e.g. a locked day) — needs manual review",
    );
    const remaining = await outboxCount();
    return { synced: savedKeys.length, failed: unsavedKeys.length, remaining };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await markOutboxFailed(keys, isPermanentRejection(err) ? "rejected" : "failed", message);
    const remaining = await outboxCount();
    return { synced: 0, failed: keys.length, remaining };
  }
}
