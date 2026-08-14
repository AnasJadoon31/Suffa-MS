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
}

function generateKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueMutation(
  method: string,
  url: string,
  data: unknown,
): Promise<string> {
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

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  return db.mutations
    .where("status")
    .anyOf("pending", "failed")
    .sortBy("created_at");
}

export async function getMutationCount(): Promise<number> {
  return db.mutations.where("status").anyOf("pending", "failed").count();
}

export async function removeMutation(key: string): Promise<void> {
  await db.mutations.where("idempotency_key").equals(key).delete();
}

export async function markMutationStatus(
  key: string,
  status: "syncing" | "failed",
  error?: string,
): Promise<void> {
  const entry = await db.mutations.where("idempotency_key").equals(key).first();
  if (entry?.id != null) {
    await db.mutations.update(entry.id, {
      status,
      error,
      attempts: entry.attempts + 1,
    });
  }
}

export async function flushMutations(): Promise<{
  synced: number;
  failed: number;
  remaining: number;
}> {
  const pending = await getPendingMutations();
  if (!pending.length) return { synced: 0, failed: 0, remaining: 0 };

  let synced = 0;
  let failed = 0;

  for (const entry of pending) {
    await markMutationStatus(entry.idempotency_key, "syncing");
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
        },
      });
      await removeMutation(entry.idempotency_key);
      synced++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed";
      await markMutationStatus(entry.idempotency_key, "failed", message);
      failed++;
    }
  }

  const remaining = await getMutationCount();
  return { synced, failed, remaining };
}

export function isMutationRequest(method: string | undefined): boolean {
  return !!method && MUTATION_METHODS.has(method.toLowerCase());
}
