"use client";

import type { ScanInputProps } from "@/components/ScanInput";
import { ScanInput } from "@/components/ScanInput";
import { TechScanModeControls } from "@/components/TechScanModeControls";
import { TechPersistentCameraScanner } from "@/components/TechPersistentCameraScanner";
import { scheduleFocus } from "@/lib/focus-helpers";
import { useCallback, useEffect, useRef, useState } from "react";

export type TechScanCaptureProps = Omit<ScanInputProps, "onScan"> & {
  onScan: NonNullable<ScanInputProps["onScan"]>;
  cameraModalTitle: string;
  /** Shown under the title while the camera overlay is open (usually the active step instruction). */
  cameraInstruction?: string;
  cameraFooterHint?: string;
  /** When true, camera button and overlay are omitted (keyboard only). */
  hideCameraOption?: boolean;
  /** When true with camera enabled, open the scanner whenever the workflow step index updates (and on first mount). */
  autoOpenCameraOnStepChange?: boolean;
  /** Remount wedge field when this changes (errors / retries). */
  scanInputKey?: string | number;
  /** Brief success copy after a step advances (shown with checkmark). */
  scanStepAck?: string | null;
  /** Flow validation/API errors — duplicated inside the camera overlay so they stay visible while scanning. */
  workflowError?: string | null;
  /**
   * Whole-flow success (e.g. receive saved after location scan) — shown inside the overlay so it is not hidden behind full-screen camera.
   */
  workflowSuccessMessage?: string | null;
  /** Step index from the scan flow — bumps highlight when it changes. */
  stepIndex?: number;
  /** Label for what should be scanned next (keyboard path cue). */
  stepLabel?: string;
  /** If set, called when the camera overlay closes (Close, or “Keyboard only”) — e.g. receive flow switches to manual. */
  onCameraSessionDismissed?: () => void;
  /**
   * Hide the compact “Use Camera” / “Keyboard only” row. Use when the page supplies its own full-width mode toggle
   * (e.g. deploy / custody transfer).
   */
  omitInlineModeControls?: boolean;
};

/**
 * Keyboard wedge first: camera opens only after “Use Camera”. One QR session stays mounted inside that overlay until Close,
 * routing each decode through `onScan` while the flow advances externally.
 */
export function TechScanCapture({
  onScan,
  cameraModalTitle,
  cameraInstruction,
  cameraFooterHint,
  hideCameraOption = false,
  autoOpenCameraOnStepChange = false,
  scanInputKey,
  scanStepAck,
  workflowError,
  workflowSuccessMessage,
  stepIndex = 0,
  stepLabel,
  onCameraSessionDismissed,
  omitInlineModeControls = false,
  disabled,
  ...scanInputProps
}: TechScanCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cameraOverlayOpen, setCameraOverlayOpen] = useState(false);
  const [cameraRetryNonce, setCameraRetryNonce] = useState(0);
  const [flashNextCue, setFlashNextCue] = useState(false);

  const firstStepMountRef = useRef(true);

  useEffect(() => {
    if (firstStepMountRef.current) {
      firstStepMountRef.current = false;
      return;
    }
    setFlashNextCue(true);
    const id = window.setTimeout(() => setFlashNextCue(false), 2300);
    return () => window.clearTimeout(id);
  }, [stepIndex]);

  useEffect(() => {
    if (!cameraOverlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cameraOverlayOpen]);

  /** Manual mode hides the overlay in the tree—reset local open state so returning to camera doesn’t flash a stale open overlay. */
  useEffect(() => {
    if (hideCameraOption) setCameraOverlayOpen(false);
  }, [hideCameraOption]);

  const handleCameraScan = useCallback(
    async (text: string): Promise<boolean> => {
      const r = await Promise.resolve(onScan(text, { source: "camera" }));
      return r === true;
    },
    [onScan],
  );

  const scanPaused = Boolean(disabled);
  const pauseCameraHardware = Boolean(
    disabled ||
      (scanStepAck != null && scanStepAck !== "") ||
      (workflowSuccessMessage != null && workflowSuccessMessage !== ""),
  );
  const cameraStreamActive = !pauseCameraHardware;

  const openOrRetryCamera = useCallback(() => {
    if (hideCameraOption) return;
    setCameraOverlayOpen((wasOpen) => {
      if (wasOpen) setCameraRetryNonce((n) => n + 1);
      return true;
    });
  }, [hideCameraOption]);

  /** Open the overlay when it was closed — does not remount the scanner (step advances must keep the same session). */
  const ensureCameraOverlayOpen = useCallback(() => {
    if (hideCameraOption) return;
    setCameraOverlayOpen(true);
  }, [hideCameraOption]);

  const dismissCamera = useCallback(() => {
    setCameraOverlayOpen(false);
    onCameraSessionDismissed?.();
    queueMicrotask(() => scheduleFocus(inputRef.current));
  }, [onCameraSessionDismissed]);

  const switchManual = useCallback(() => {
    dismissCamera();
  }, [dismissCamera]);

  useEffect(() => {
    if (!autoOpenCameraOnStepChange || hideCameraOption || disabled) return;
    ensureCameraOverlayOpen();
  }, [autoOpenCameraOnStepChange, hideCameraOption, disabled, stepIndex, ensureCameraOverlayOpen]);

  return (
    <div className="flex flex-col gap-3">
      {hideCameraOption ? (
        <p className="text-xs leading-snug text-gray-600">
          <span className="font-medium text-gray-800">This step:</span> type the payload, then{" "}
          <kbd className="rounded border border-gray-300 bg-gray-100 px-1 font-mono text-[11px] text-gray-800">
            Enter
          </kbd>
          .
        </p>
      ) : omitInlineModeControls ? (
        autoOpenCameraOnStepChange ? (
          <p className="text-xs leading-snug text-gray-600">
            <span className="font-medium text-gray-800">Camera mode:</span> the live scanner opens for each step. Use{" "}
            <span className="font-semibold text-gray-900">Use manual entry instead</span> below to type payloads +{" "}
            <kbd className="rounded border border-gray-300 bg-gray-100 px-1 font-mono text-[11px] text-gray-800">
              Enter
            </kbd>
            .
          </p>
        ) : (
          <p className="text-xs leading-snug text-gray-600">
            <span className="font-medium text-gray-800">Keyboard:</span> type the QR payload +{" "}
            <kbd className="rounded border border-gray-300 bg-gray-100 px-1 font-mono text-[11px] text-gray-800">
              Enter
            </kbd>
            . <span className="font-medium text-gray-800">Camera:</span> use{" "}
            <span className="font-semibold text-gray-900">Use camera for this flow</span> below — the scanner opens for
            each step until you switch back.
          </p>
        )
      ) : (
        <p className="text-xs leading-snug text-gray-600">
          <span className="font-medium text-gray-800">Keyboard:</span> type the QR payload +{" "}
          <kbd className="rounded border border-gray-300 bg-gray-100 px-1 font-mono text-[11px] text-gray-800">
            Enter
          </kbd>
          . <span className="font-medium text-gray-800">Camera:</span> tap{" "}
          <span className="font-semibold text-gray-900">Use Camera</span>
          {autoOpenCameraOnStepChange ? " (opens each step automatically)" : ""} — same session advances step-by-step
          until you close it.
        </p>
      )}

      {scanStepAck ? (
        <div
          key={`${stepIndex}-${scanStepAck}`}
          role="status"
          aria-live="polite"
          className="flex flex-col gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950 shadow-sm"
        >
          <div className="flex items-start gap-2">
            <span className="tech-scan-check-icon text-xl leading-none text-emerald-600" aria-hidden>
              ✓
            </span>
            <span className="leading-snug">{scanStepAck}</span>
          </div>
          {stepLabel ? (
            <p className="border-t border-emerald-600/20 pt-2 text-xs font-medium leading-snug text-emerald-900">
              Next: scan your <span className="font-semibold">{stepLabel}</span> QR (or type + Enter below).
            </p>
          ) : null}
        </div>
      ) : null}

      {stepLabel ? (
        <div
          className={`rounded-lg border px-3 py-2 transition-colors ${flashNextCue ? "tech-scan-next-cue border-emerald-400 bg-emerald-50/90" : "border-gray-200 bg-gray-50"}`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">Next scan</p>
          <p className="text-sm font-semibold text-gray-900">{stepLabel}</p>
        </div>
      ) : null}

      <ScanInput
        key={scanInputKey ?? "scan-input"}
        ref={inputRef}
        onScan={onScan}
        disabled={disabled}
        {...scanInputProps}
      />

      {hideCameraOption || omitInlineModeControls ? null : (
        <TechScanModeControls
          cameraOverlayOpen={cameraOverlayOpen}
          disabled={disabled}
          onUseCamera={openOrRetryCamera}
          onSwitchManual={switchManual}
        />
      )}

      {!hideCameraOption && cameraOverlayOpen ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tech-scan-camera-heading"
        >
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 bg-zinc-950 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/90">Live scanner</p>
              <h2 id="tech-scan-camera-heading" className="truncate text-lg font-semibold text-white">
                {cameraModalTitle}
              </h2>
              {cameraInstruction ? (
                <p className="mt-1 text-sm leading-snug text-white/75">{cameraInstruction}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={dismissCamera}
              className="min-h-[48px] min-w-[88px] shrink-0 touch-manipulation rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-base font-medium text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"
            >
              Close
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2 pt-2">
            {workflowError ? (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-2 shrink-0 rounded-lg border border-amber-400/90 bg-amber-950 px-3 py-2 shadow-lg"
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-200">Fix needed</p>
                <p className="mt-1 text-sm font-medium leading-snug text-amber-50">{workflowError}</p>
                <p className="mt-2 text-xs leading-snug text-amber-100/95">
                  {workflowError.includes("Serial") || workflowError.includes("serial")
                    ? "Check the equipment QR matches the asset on file (serial must match operations)."
                    : "Please scan or type the correct payload for this step."}
                </p>
              </div>
            ) : null}

            {workflowSuccessMessage ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-2 shrink-0 rounded-lg border border-emerald-400/90 bg-emerald-950 px-3 py-3 shadow-lg"
              >
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-200/95">Workflow complete</p>
                <p className="mt-1 text-base font-semibold leading-snug text-emerald-50">{workflowSuccessMessage}</p>
                <p className="mt-2 text-xs leading-snug text-emerald-100/95">
                  Continue with the next step — scan or type below, or close the camera when you are finished.
                </p>
              </div>
            ) : null}

            {scanStepAck ? (
              <div
                key={`overlay-${stepIndex}-${scanStepAck}`}
                role="status"
                aria-live="polite"
                className="mb-2 shrink-0 rounded-lg border border-emerald-400/80 bg-emerald-950 px-3 py-2 shadow-lg"
              >
                <div className="flex items-start gap-2">
                  <span className="tech-scan-check-icon text-xl leading-none text-emerald-400" aria-hidden>
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-200/95">Step done</p>
                    <p className="mt-0.5 text-sm font-semibold leading-snug text-emerald-50">{scanStepAck}</p>
                    {stepLabel ? (
                      <p className="mt-2 border-t border-emerald-700/80 pt-2 text-xs leading-snug text-emerald-100">
                        <span className="font-semibold text-white">Next:</span> scan your{" "}
                        <span className="font-semibold text-emerald-200">{stepLabel}</span> QR — different label than the
                        last scan.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs leading-snug text-emerald-100">
                        Continue with the next QR for this workflow.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <TechPersistentCameraScanner
              chrome="plain"
              active={cameraStreamActive}
              scanPaused={scanPaused}
              retryNonce={cameraRetryNonce}
              title={cameraModalTitle}
              footerHint={
                workflowError
                  ? "Resolve the alert above, then scan again."
                  : !cameraStreamActive && workflowSuccessMessage
                    ? "Camera off — live preview resumes when this message clears."
                    : !cameraStreamActive && scanStepAck
                      ? "Camera off while you review — preview resumes in a moment."
                      : !cameraStreamActive
                        ? "Please wait…"
                        : cameraFooterHint ?? "Hold the QR steady — submits automatically when read."
              }
              onScan={handleCameraScan}
            />
          </div>

          <p className="shrink-0 border-t border-white/10 bg-zinc-950 px-3 py-2 text-center text-xs leading-snug text-white/75 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {workflowError
              ? "Read the alert above. The preview stays live — scan again when fixed."
              : !cameraStreamActive && workflowSuccessMessage
                ? "Camera paused — preview turns back on when this banner clears."
                : !cameraStreamActive && scanStepAck
                  ? "Camera paused — give it a moment before the next scan."
                  : !cameraStreamActive
                    ? "Working — camera paused."
                    : "Waiting on this step’s QR. Close anytime to type with the keyboard field instead."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
