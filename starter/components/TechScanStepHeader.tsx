/**
 * High-visibility “what you’re doing now” for /tech scan flows (receive, store, deploy, transfer).
 */
export function TechScanStepHeader({
  current,
  total,
  label,
  workflowCompleted = false,
  className = "",
}: {
  current: number;
  total: number;
  /** Active-step label (“Asset tag …”) shown while progressing. */
  label: string;
  /** Locks the ribbon into terminal “workflow complete” state (scanner may still accept the next wedge). */
  workflowCompleted?: boolean;
  className?: string;
}) {
  const active = workflowCompleted ? "rounded-lg border-2 border-emerald-900/35 bg-emerald-50 px-3 py-2.5 shadow-sm" : "rounded-lg border-2 border-blue-700/25 bg-blue-50 px-3 py-2.5 shadow-sm";

  const headerLine = workflowCompleted ? "Workflow complete" : `Now · Step ${current} of ${total}`;
  const subtitle = workflowCompleted
    ? "Review the success panel below, then Start Next Scan or Close when finished."
    : label;

  return (
    <div className={`${active} ${className}`}>
      <p
        className={`text-[11px] font-bold uppercase tracking-wider ${workflowCompleted ? "text-emerald-950" : "text-blue-900"}`}
      >
        {headerLine}
      </p>
      <p className={`mt-1 text-base leading-snug ${workflowCompleted ? "font-medium text-emerald-950" : "font-bold text-gray-900"}`}>{subtitle}</p>
    </div>
  );
}
