"use client";

import { useEffect, useRef } from "react";

/** Compact operational banners — left accent only, minimal chrome. */
export function ScanWorkflowStatus({
  success,
  error,
}: {
  success?: string | null;
  error?: string | null;
}) {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!error || !errorRef.current) return;
    errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  return (
    <div className="space-y-2">
      {success ? (
        <div
          role="status"
          className="border-l-4 border-green-600 bg-green-50 py-2 pl-3 pr-2 text-sm font-medium leading-snug text-green-950"
        >
          {success}
        </div>
      ) : null}
      {error ? (
        <div
          ref={errorRef}
          role="alert"
          className="border-l-4 border-amber-600 bg-amber-50 py-2 pl-3 pr-2 text-sm leading-snug text-amber-950"
        >
          <p className="font-medium">{error}</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Wrong QR, invalid format, or mismatch — fix it and scan again.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ScanLoadingLine({ label }: { label: string }) {
  return (
    <p
      className="flex items-center gap-2 text-sm font-medium leading-snug text-gray-700"
      aria-live="polite"
    >
      <span
        className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-600"
        aria-hidden
      />
      {label}
    </p>
  );
}
