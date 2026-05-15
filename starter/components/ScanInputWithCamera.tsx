"use client";

import { BarcodeCameraModal } from "@/components/BarcodeCameraModal";
import type { ScanInputProps } from "@/components/ScanInput";
import { ScanInput } from "@/components/ScanInput";
import { scheduleFocus } from "@/lib/focus-helpers";
import { useCallback, useRef, useState } from "react";

export type ScanInputWithCameraProps = ScanInputProps & {
  cameraButtonLabel?: string;
  cameraModalTitle?: string;
  enableCamera?: boolean;
  /**
   * When false (e.g. camera-first multi-step flows), do not move focus back to the wedge field after a camera decode.
   * @default true
   */
  refocusAfterCameraScan?: boolean;
};

/**
 * Keyboard wedge + Enter stays the fast default; camera shares the same `onScan` handler.
 */
export function ScanInputWithCamera({
  cameraButtonLabel = "Camera",
  cameraModalTitle = "Scan QR code",
  enableCamera = true,
  refocusAfterCameraScan = true,
  onScan,
  ...scanInputProps
}: ScanInputWithCameraProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const closeCamera = useCallback(() => {
    setCameraOpen(false);
    if (refocusAfterCameraScan) {
      scheduleFocus(inputRef.current);
    }
  }, [refocusAfterCameraScan]);

  const handleCameraDecoded = useCallback(
    (text: string) => {
      const v = text.trim();
      if (!v) return;
      void Promise.resolve(onScan(v, { source: "camera" })).finally(() => {
        setCameraOpen(false);
        if (refocusAfterCameraScan) {
          scheduleFocus(inputRef.current);
        }
      });
    },
    [onScan, refocusAfterCameraScan],
  );

  return (
    <div className="flex flex-col gap-2">
      <ScanInput ref={inputRef} onScan={onScan} {...scanInputProps} />
      {enableCamera ? (
        <>
          <button
            type="button"
            disabled={scanInputProps.disabled}
            onClick={() => setCameraOpen(true)}
            className="min-h-[48px] w-full touch-manipulation rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 text-center text-base font-semibold text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Scan with device camera"
          >
            {cameraButtonLabel}
          </button>
          <BarcodeCameraModal
            open={cameraOpen}
            onClose={closeCamera}
            onDecoded={handleCameraDecoded}
            title={cameraModalTitle}
          />
        </>
      ) : null}
    </div>
  );
}
