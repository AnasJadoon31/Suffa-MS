import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import { flushMutations, getMutationCount } from "./mutationQueue";

export function useMutationSync(): {
  pending: number;
  syncing: boolean;
  flush: () => Promise<void>;
} {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = await getMutationCount();
    setPending((prev) => (prev === count ? prev : count));
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

  return { pending, syncing, flush };
}
