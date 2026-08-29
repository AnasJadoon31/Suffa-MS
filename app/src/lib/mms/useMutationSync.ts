import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  discardAllRejectedMutations,
  flushMutations,
  getMutationCount,
  getRejectedCount,
} from "./mutationQueue";

export function useMutationSync(): {
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
    const [count, rejectedCount] = await Promise.all([getMutationCount(), getRejectedCount()]);
    setPending((prev) => (prev === count ? prev : count));
    setRejected((prev) => (prev === rejectedCount ? prev : rejectedCount));
  }, []);

  const flush = useCallback(async () => {
    if (flushingRef.current || !online) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      await flushMutations();
      await refreshCount();
    } finally {
      setSyncing(false);
      flushingRef.current = false;
    }
  }, [online, refreshCount]);

  const discardRejected = useCallback(async () => {
    await discardAllRejectedMutations();
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
    }, 3000);
    return () => window.clearInterval(interval);
  }, [refreshCount]);

  return { pending, syncing, rejected, flush, discardRejected, refresh: refreshCount };
}
