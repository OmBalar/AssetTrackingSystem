"use client";

export type TechWorkflowDetailRow = { label: string; value: string };

export type TechWorkflowSuccessBannerProps = {
  headline: string;
  details: readonly TechWorkflowDetailRow[];
  capturedSteps?: readonly TechWorkflowDetailRow[];
  auxiliary?: string | null;
  /** Hint shown in summary when collapsed (e.g. when banner clears). */
  persistHint?: string;
  /** Pin to viewport top (default) or bottom — bottom pairs well after completing a full-screen camera session. */
  placement?: "top" | "bottom";
};

/**
 * Compact fixed success ribbon: one-line summary by default; full asset + session details inside `<details>`.
 * Stays until parent unmounts (e.g. next scan resets the flow). z-index above full-screen camera overlay.
 */
export function TechWorkflowSuccessBanner({
  headline,
  details,
  capturedSteps,
  auxiliary,
  persistHint = "Expand for full details — hides when you scan the next asset tag.",
  placement = "top",
}: TechWorkflowSuccessBannerProps) {
  const tagLine = details.find((r) => r.label === "Asset tag")?.value?.trim() ?? "";
  const detailCls = "break-words font-mono text-[13px] font-semibold text-gray-950";

  const pinCls =
    placement === "bottom"
      ? "bottom-0 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1"
      : "top-0 pt-[max(0.35rem,env(safe-area-inset-top))] pb-1";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 z-[110] flex justify-center px-3 pointer-events-none ${pinCls}`}
    >
      <details className="pointer-events-auto w-full max-w-2xl rounded-lg border border-emerald-700/40 bg-emerald-50 shadow-md ring-1 ring-black/5">
        <summary className="cursor-pointer select-none list-none px-3 py-2 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold leading-snug text-emerald-950">
            <span className="text-base text-emerald-700" aria-hidden>
              ✓
            </span>
            <span>{headline}</span>
            {tagLine ? (
              <>
                <span className="hidden text-emerald-700/80 sm:inline" aria-hidden>
                  ·
                </span>
                <span className="font-mono text-[13px] font-bold tracking-tight text-emerald-950">{tagLine}</span>
              </>
            ) : null}
          </span>
          <p className="mt-1 text-[11px] font-medium leading-snug text-emerald-900/80">{persistHint}</p>
        </summary>

        <div className="max-h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-9rem)] overflow-y-auto border-t border-emerald-900/15 px-3 pb-3 pt-2">
          <dl className="space-y-2 text-sm leading-snug text-gray-900">
            {details.map((row) => (
              <div key={row.label} className="border-t border-emerald-900/10 pt-2 first:border-t-0 first:pt-0">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-600">{row.label}</dt>
                <dd className={detailCls}>{row.value}</dd>
              </div>
            ))}
          </dl>

          {auxiliary?.trim() ? (
            <p className="mt-3 rounded-lg border border-emerald-900/15 bg-white/70 px-3 py-2 text-xs leading-snug text-gray-800">
              {auxiliary.trim()}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
