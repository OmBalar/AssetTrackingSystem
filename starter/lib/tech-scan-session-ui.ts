/**
 * Short labels for the persistent success panel (operator-facing terminals).
 */

export function formatScanSessionRelativeTime(doneAtMs: number, nowMs: number = Date.now()): string {
  const sec = Math.max(0, Math.floor((nowMs - doneAtMs) / 1000));
  if (sec < 45) return "Updated just now";
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    return `Updated ${m} min ago`;
  }
  return new Date(doneAtMs).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
