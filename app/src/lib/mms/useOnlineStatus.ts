import { useEffect, useState } from "react";

let _online = typeof window === "undefined" ? true : window.navigator.onLine;
const _listeners: Array<(online: boolean) => void> = [];

function _setOnline(online: boolean) {
  if (_online === online) return;
  _online = online;
  _listeners.forEach((fn) => fn(online));
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => _setOnline(true));
  window.addEventListener("offline", () => _setOnline(false));
}

export function isOnline(): boolean {
  return _online;
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(_online);

  useEffect(() => {
    _listeners.push(setOnline);
    return () => {
      const idx = _listeners.indexOf(setOnline);
      if (idx >= 0) _listeners.splice(idx, 1);
    };
  }, []);

  return online;
}
