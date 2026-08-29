import { db, type OutboxEntry } from "./db";
import { attendanceApi, type AttendanceSyncEntry } from "./endpoints";

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

function isRecoverable(entry: OutboxEntry): boolean {
  if (entry.status == null || entry.status === "pending" || entry.status === "failed") return true;
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

export async function removeFromOutbox(idempotencyKeys: string[]): Promise<void> {
  if (!idempotencyKeys.length) return;
  await db.outbox.where("idempotency_key").anyOf(idempotencyKeys).delete();
}

async function markOutboxFailed(idempotencyKeys: string[]): Promise<void> {
  if (!idempotencyKeys.length) return;
  const entries = await db.outbox.where("idempotency_key").anyOf(idempotencyKeys).toArray();
  await db.transaction("rw", db.outbox, async () => {
    for (const e of entries) {
      if (e.id != null) await db.outbox.update(e.id, { status: "failed" });
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
    // Claimed but not acknowledged (e.g. locked-day rejections) — surface as
    // failed immediately rather than leaving them on "syncing" until
    // STALE_SYNC_MS passes.
    const unsavedKeys = keys.filter((k) => !savedKeys.includes(k));
    await markOutboxFailed(unsavedKeys);
    const remaining = await outboxCount();
    return { synced: savedKeys.length, failed: unsavedKeys.length, remaining };
  } catch {
    await markOutboxFailed(keys);
    const remaining = await outboxCount();
    return { synced: 0, failed: keys.length, remaining };
  }
}
