"use client";

import type { TechScanCapturedStep } from "@/lib/tech-scan-flow";

/**
 * Operational “terminal log”: prior scans stay readable while advancing through multi-step workflows.
 */
export function TechScanCapturedSteps({
  items,
  nextStepLabel,
  completedSession,
}: {
  items: readonly TechScanCapturedStep[];
  /** When set, renders the cue for what to scan next (active flow only). */
  nextStepLabel?: string | null;
  /** Hides “Next scan” cues after the workflow succeeds (captures remain for audit glance). */
  completedSession?: boolean;
}) {
  if (!items.length) return null;

  const newestFirst = [...items].map((row, originalIndex) => ({ row, originalIndex })).reverse();

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-3 text-sm shadow-inner">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-700">Captured this session</p>
      <ul className="space-y-3 border-t border-gray-200/90 pt-2" aria-label="Scanned values for this workflow">
        {newestFirst.map(({ row, originalIndex }) => (
          <li
            key={`${row.label}-${originalIndex}`}
            className="border-b border-gray-200 pb-3 last:border-b-0 last:pb-0"
          >
            <p className="flex items-start gap-2 leading-snug text-gray-950">
              <span className="tech-scan-check-icon mt-px shrink-0 text-base font-bold text-emerald-700" aria-hidden>
                ✓
              </span>
              <span>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">{row.label}</span>
                <span className="mt-0.5 block break-words font-mono text-[15px] font-semibold text-gray-950">{row.value}</span>
              </span>
            </p>
          </li>
        ))}
      </ul>
      {!completedSession && nextStepLabel?.trim() ? (
        <p className="border-t border-dashed border-gray-300 pt-2 text-[13px] font-medium leading-snug text-emerald-950">
          <span className="mr-2 text-gray-900">→ Next:</span>
          Scan or enter <span className="font-semibold text-gray-950">{nextStepLabel}</span>
        </p>
      ) : null}
    </div>
  );
}
