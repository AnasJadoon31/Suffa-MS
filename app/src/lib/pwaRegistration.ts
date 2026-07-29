import { registerSW } from "virtual:pwa-register";

type PwaRegistrationEvent = "offlineReady" | "needRefresh" | "registered" | "error";

type PwaRegistrationListener = (event: PwaRegistrationEvent) => void;

const listeners = new Set<PwaRegistrationListener>();
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;
let started = false;
const stickyEvents = new Set<PwaRegistrationEvent>();

export function subscribePwaRegistration(listener: PwaRegistrationListener) {
  listeners.add(listener);
  ensurePwaRegistration();
  stickyEvents.forEach((event) => listener(event));
  return () => {
    listeners.delete(listener);
  };
}

function notify(event: PwaRegistrationEvent) {
  if (event === "offlineReady" || event === "needRefresh") stickyEvents.add(event);
  listeners.forEach((listener) => listener(event));
}

export function ensurePwaRegistration() {
  if (started || typeof window === "undefined") return;
  started = true;

  updateServiceWorker = registerSW({
    immediate: true,
    onOfflineReady() {
      notify("offlineReady");
    },
    onNeedRefresh() {
      notify("needRefresh");
    },
    onRegisteredSW() {
      notify("registered");
    },
    onRegisterError() {
      notify("error");
    },
  });
}

export async function applyPwaUpdate() {
  if (!updateServiceWorker) return;
  await updateServiceWorker(true);
}
