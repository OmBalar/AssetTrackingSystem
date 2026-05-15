"use client";

import { assignRef } from "@/lib/assign-ref";
import { scheduleFocus } from "@/lib/focus-helpers";
import type { ScanSource } from "@/lib/scan-flow";
import { forwardRef, useEffect, useLayoutEffect, useRef } from "react";

export interface ScanInputProps {
  onScan: (
    value: string,
    meta?: { source: ScanSource },
  ) => void | Promise<void> | boolean | Promise<boolean>;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  label?: string;
  /**
   * When true (default), refocus after returning to this tab — keeps the wedge ready.
   * Turn off if this field should not steal focus from other controls.
   */
  refocusOnTabVisible?: boolean;
}

export const ScanInput = forwardRef<HTMLInputElement, ScanInputProps>(function ScanInput(
  {
    onScan,
    placeholder = "Scan or type a tag and press Enter…",
    autoFocus = true,
    disabled = false,
    label,
    refocusOnTabVisible = true,
  },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement>(null);

  function setInputEl(el: HTMLInputElement | null) {
    localRef.current = el;
    assignRef(forwardedRef, el);
  }

  useLayoutEffect(() => {
    if (autoFocus && localRef.current && !disabled) {
      scheduleFocus(localRef.current);
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (!autoFocus || disabled || !refocusOnTabVisible) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const el = localRef.current;
      if (!el || el.disabled) return;
      scheduleFocus(el);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [autoFocus, disabled, refocusOnTabVisible]);

  function fire(): void {
    const el = localRef.current;
    if (!el) return;
    const v = el.value.trim();
    if (!v) return;
    el.value = "";
    void Promise.resolve(onScan(v, { source: "keyboard" })).finally(() => {
      scheduleFocus(el);
    });
  }

  return (
    <label className="block">
      {label ? (
        <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
      ) : null}
      <input
        ref={setInputEl}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        className="min-h-[48px] w-full touch-manipulation rounded-lg border-2 border-gray-300 p-4 text-lg focus:border-blue-600 focus:outline-none disabled:bg-gray-100"
        enterKeyHint="send"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            fire();
          }
        }}
      />
    </label>
  );
});

ScanInput.displayName = "ScanInput";
