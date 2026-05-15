/**
 * High-visibility “what you’re doing now” for /tech scan flows (receive, store, deploy, transfer).
 */
export function TechScanStepHeader({
  current,
  total,
  label,
  className = "",
}: {
  current: number;
  total: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border-2 border-blue-700/25 bg-blue-50 px-3 py-2.5 shadow-sm ${className}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
        Now · Step {current} of {total}
      </p>
      <p className="mt-1 text-base font-bold leading-snug text-gray-900">{label}</p>
    </div>
  );
}
