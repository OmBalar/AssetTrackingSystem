"use client";

export type TechScanModeControlsProps = {
  /** Camera overlay / scanner session is visible on screen. */
  cameraOverlayOpen: boolean;
  disabled?: boolean;
  /** Opens camera overlay; if already open, triggers scanner retry/restart. */
  onUseCamera: () => void;
  /** Closes camera overlay and returns to keyboard-first entry. */
  onSwitchManual: () => void;
  className?: string;
};

const btnBase =
  "min-h-[44px] flex-1 touch-manipulation rounded-lg border-2 px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Keyboard wedge stays primary until “Use Camera” opens the scanning overlay (same session through every step until Close).
 */
export function TechScanModeControls({
  cameraOverlayOpen,
  disabled,
  onUseCamera,
  onSwitchManual,
  className = "",
}: TechScanModeControlsProps) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
      role="group"
      aria-label="Scan input method"
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={cameraOverlayOpen}
        onClick={() => {
          if (disabled) return;
          onUseCamera();
        }}
        className={`${btnBase} border-gray-900 bg-gray-900 text-white hover:bg-gray-800 focus:ring-gray-900 ${
          cameraOverlayOpen ? "ring-2 ring-gray-900 ring-offset-2" : ""
        }`}
      >
        Use Camera
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={!cameraOverlayOpen}
        onClick={() => {
          if (disabled) return;
          onSwitchManual();
        }}
        className={`${btnBase} border-gray-300 bg-white text-gray-900 hover:bg-gray-50 focus:ring-blue-600 ${
          !cameraOverlayOpen ? "ring-2 ring-blue-600 ring-offset-2" : ""
        }`}
      >
        {cameraOverlayOpen ? "Close camera · keyboard" : "Keyboard only"}
      </button>
    </div>
  );
}
