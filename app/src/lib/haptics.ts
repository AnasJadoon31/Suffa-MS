/**
 * Haptic feedback utility.
 * Uses navigator.vibrate() where supported. Silently no-ops otherwise.
 */

export function hapticLight(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(10);
  }
}

export function hapticMedium(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(25);
  }
}

export function hapticHeavy(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([15, 30, 15]);
  }
}

export function hapticSuccess(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([10, 50, 20]);
  }
}

export function hapticError(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate([25, 50, 25]);
  }
}
