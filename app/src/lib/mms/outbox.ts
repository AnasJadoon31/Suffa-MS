import { db, type OutboxEntry } from "./db";
import { attendanceApi, type AttendanceSyncEntry } from "./endpoints";

export async function enqueueEntry(entry: AttendanceSyncEntry): Promise<number> {
  return db.outbox.add({
    idempotency_key: entry.idempotency_key,
    entry,
    created_at: new Date().toISOString(),
    attempts: 0,
  });
}

export async function peekOutbox(): Promise<OutboxEntry[]> {
  return db.outbox.orderBy("created_at").toArray();
}

export async function outboxCount(): Promise<number> {
  return db.outbox.count();
}

export async function removeFromOutbox(idempotencyKeys: string[]): Promise<void> {
  if (!idempotencyKeys.length) return;
  await db.outbox.where("idempotency_key").anyOf(idempotencyKeys).delete();
}

export async function incrementAttempts(idempotencyKeys: string[]): Promise<void> {
  const entries = await db.outbox.where("idempotency_key").anyOf(idempotencyKeys).toArray();
  await db.transaction("rw", db.outbox, async () => {
    for (const e of entries) {
      if (e.id != null) {
        await db.outbox.update(e.id, { attempts: e.attempts + 1 });
      }
    }
  });
}

export async function flushOutbox(): Promise<{ synced: number; failed: number; remaining: number }> {
  const entries = await peekOutbox();
  if (!entries.length) return { synced: 0, failed: 0, remaining: 0 };

  const syncEntries = entries.map((e) => e.entry);
  const keys = entries.map((e) => e.idempotency_key);

  try {
    const result = await attendanceApi.sync(syncEntries);
    const savedKeys = result.idempotency_keys ?? keys;
    await removeFromOutbox(savedKeys);
    const remaining = await outboxCount();
    return { synced: savedKeys.length, failed: 0, remaining };
  } catch {
    await incrementAttempts(keys);
    const remaining = await outboxCount();
    return { synced: 0, failed: keys.length, remaining };
  }
}
