import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  discardAllRejectedOutboxEntries,
  flushOutbox,
  getRejectedOutboxCount,
  outboxCount,
} from "./outbox";

// Dispatched whenever a flush actually synced at least one attendance
// entry — lets route-level components (e.g. the calendar's optimistic
// offline-save placeholders) invalidate their own server-backed caches the
// moment sync completes, instead of only on their next natural refetch
// (month change, remount, manual refresh).
export const OUTBOX_SYNCED_EVENT = "mms:outbox-synced";

export function useOutboxSync(): {
  pending: number;
  syncing: boolean;
  rejected: number;
  flush: () => Promise<void>;
  discardRejected: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const [count, rejectedCount] = await Promise.all([outboxCount(), getRejectedOutboxCount()]);
    setPending((prev) => (prev === count ? prev : count));
    setRejected((prev) => (prev === rejectedCount ? prev : rejectedCount));
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || !online) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      const result = await flushOutbox();
      await refreshCount();
      if (result.synced > 0 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(OUTBOX_SYNCED_EVENT, { detail: result }));
      }
    } finally {
      setSyncing(false);
      flushingRef.current = false;
    }
  }, [online, refreshCount]);

  const discardRejected = useCallback(async () => {
    await discardAllRejectedOutboxEntries();
    await refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (online && pending > 0) {
      void flush();
    }
  }, [online, pending, flush]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refreshCount();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refreshCount]);

  return { pending, syncing, rejected, flush, discardRejected, refresh: refreshCount };
}
