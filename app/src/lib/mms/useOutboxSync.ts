import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  discardAllRejectedOutboxEntries,
  flushOutbox,
  getRejectedOutboxCount,
  outboxCount,
} from "./outbox";

export function useOutboxSync(): {
  pending: number;
  syncing: boolean;
  rejected: number;
  flush: () => Promise<void>;
  discardRejected: () => Promise<void>;
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
      await flushOutbox();
      await refreshCount();
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

  return { pending, syncing, rejected, flush, discardRejected };
}
