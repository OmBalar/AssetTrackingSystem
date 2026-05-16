"use client";

import { formatScanSessionRelativeTime } from "@/lib/tech-scan-session-ui";
import { useEffect, useState } from "react";

export type TechWorkflowSuccessPanelProps = {
  headline: string;
  assetTag: string | null;
  /** Human-readable state label (already passed through helpers). */
  stateLabel: string | null;
  locationLine: string | null;
  /** Shown only when custody / transfer workflows need it */
  custodianLine?: string | null;
  updatedAtMs: number;
  /** Extra line (duplicate receive notes, mocks text, etc.) */
  auxiliary?: string | null;
  primaryActionLabel?: string;
  dismissActionLabel?: string;
  onPrimary: () => void;
  /** Collapses panel + resets flow from parent — same as clearing success state */
  onDismiss: () => void;
};

/** Persistent completion card shown until the tech starts another session or dismisses explicitly. */
export function TechWorkflowSuccessPanel({
  headline,
  assetTag,
  stateLabel,
  locationLine,
  custodianLine,
  updatedAtMs,
  auxiliary,
  primaryActionLabel = "Start Next Scan",
  dismissActionLabel = "Close",
  onPrimary,
  onDismiss,
}: TechWorkflowSuccessPanelProps) {
  const [relative, setRelative] = useState(() => formatScanSessionRelativeTime(updatedAtMs));

  useEffect(() => {
    const tick = () => setRelative(formatScanSessionRelativeTime(updatedAtMs));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [updatedAtMs]);

  const rowClass = "mt-1 text-[15px] font-semibold text-gray-950";

  return (
    <div
      role="status"
      className="space-y-3 rounded-xl border-2 border-emerald-700/35 bg-emerald-50 px-4 py-4 shadow-sm"
      aria-live="polite"
    >
      <p className="flex flex-wrap items-center gap-2 leading-snug text-emerald-950">
        <span className="text-lg font-bold text-emerald-800" aria-hidden>
          ✓
        </span>
        <span className="text-base font-semibold">{headline}</span>
      </p>

      <dl className="space-y-2 border-t border-emerald-800/15 pt-3 text-sm leading-snug text-gray-900">
        {assetTag?.trim() ? (
          <>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Asset</dt>
            <dd className={rowClass}>{assetTag.trim()}</dd>
          </>
        ) : null}
        {stateLabel?.trim() ? (
          <>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-600">State</dt>
            <dd className={rowClass}>{stateLabel.trim()}</dd>
          </>
        ) : null}
        {locationLine?.trim() ? (
          <>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Location</dt>
            <dd className="break-words font-mono text-sm font-semibold text-gray-950">{locationLine.trim()}</dd>
          </>
        ) : null}
        {custodianLine?.trim() ? (
          <>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-600">Custodian</dt>
            <dd className="break-words font-mono text-sm font-semibold text-gray-950">{custodianLine.trim()}</dd>
          </>
        ) : null}
        <dt className="sr-only">When</dt>
        <dd className="pt-2 text-xs font-medium text-gray-600">{relative}</dd>
      </dl>

      {auxiliary?.trim() ? (
        <p className="rounded-lg border border-emerald-900/15 bg-white/65 px-3 py-2 text-xs leading-snug text-gray-800">
          {auxiliary.trim()}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 border-t border-emerald-800/15 pt-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onPrimary}
          className="min-h-[48px] flex-1 touch-manipulation rounded-lg bg-emerald-800 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
        >
          {primaryActionLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[48px] touch-manipulation rounded-lg border border-gray-400 bg-white px-4 py-3 text-base font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-700 focus:ring-offset-2 sm:min-w-[8rem]"
        >
          {dismissActionLabel}
        </button>
      </div>
    </div>
  );
}
