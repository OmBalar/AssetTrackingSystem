import type { MutableRefObject, Ref } from "react";

/** Merge a callback/Object ref onto a local ref (for forwardRef + imperative use). */
export function assignRef<T>(ref: Ref<T> | null | undefined, value: T | null): void {
  if (ref == null) return;
  if (typeof ref === "function") {
    ref(value);
  } else {
    (ref as MutableRefObject<T | null>).current = value;
  }
}
