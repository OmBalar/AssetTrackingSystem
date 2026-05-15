import { useEffect } from "react";

/** Clears a string message after `delayMs` (e.g. success toast) so the next read stays clean. */
export function useAutoDismiss(
  value: string | null,
  setValue: (next: string | null) => void,
  delayMs: number = 6000,
): void {
  useEffect(() => {
    if (!value) return;
    const id = window.setTimeout(() => setValue(null), delayMs);
    return () => window.clearTimeout(id);
  }, [value, setValue, delayMs]);
}
