import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import { flushOutbox, outboxCount } from "./outbox";

export function useOutboxSync(): { pending: number; syncing: boolean; flush: () => Promise<void> } {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    const count = await outboxCount();
    setPending(count);
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

  return { pending, syncing, flush };
}
