"use client";

import {
  type QrcodeErrorCallback,
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type BarcodeCameraModalProps = {
  open: boolean;
  onClose: () => void;
  onDecoded: (text: string) => void;
  title?: string;
};

function formatStartError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (/Permission|NotAllowed|denied|Permission dismissed/i.test(m)) {
      return "Camera blocked — allow it for this site in browser settings, then tap Try again.";
    }
    if (/NotFound|DevicesNotFound|no.*camera/i.test(m)) {
      return "No camera found. Use the keyboard field below or another device.";
    }
    if (/Constraint|could not start video source/i.test(m)) {
      return "Camera in use or unavailable. Close other apps using the camera, or type the code.";
    }
    return m.length < 120 ? m : "Camera failed to start. Try again or type the code.";
  }
  return "Camera failed to start. Check permissions or type the code.";
}

const SUPPORTED = [Html5QrcodeSupportedFormats.QR_CODE];

function killMediaTracksUnderElement(elementId: string): void {
  if (typeof document === "undefined") return;
  const root = document.getElementById(elementId);
  if (!root) return;
  root.querySelectorAll("video").forEach((video) => {
    const ms = video.srcObject;
    if (ms && typeof (ms as MediaStream).getTracks === "function") {
      (ms as MediaStream).getTracks().forEach((t) => t.stop());
    }
    video.srcObject = null;
  });
}

function tearDownHtml5Qrcode(scanner: Html5Qrcode, elementId: string): void {
  const sweepDom = () => {
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
    killMediaTracksUnderElement(elementId);
    queueMicrotask(() => killMediaTracksUnderElement(elementId));
  };

  try {
    const p = scanner.stop();
    void Promise.resolve(p)
      .catch(() => {})
      .finally(sweepDom);
  } catch {
    sweepDom();
  }
}

export function BarcodeCameraModal({
  open,
  onClose,
  onDecoded,
  title = "Scan QR code",
}: BarcodeCameraModalProps) {
  const reactId = useId();
  const regionId = `barcode-region-${reactId.replace(/:/g, "")}`;
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );
  const handledRef = useRef(false);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;

  const bumpRetry = useCallback(() => {
    setScannerError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const streamShouldRun = open && pageVisible;

  useEffect(() => {
    let liveScanner: Html5Qrcode | null = null;

    if (!streamShouldRun) {
      handledRef.current = false;
      setScannerError(null);
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setScannerError("Camera needs HTTPS or localhost. Type the code instead.");
      return;
    }

    handledRef.current = false;
    let cancelled = false;

    const errorCb: QrcodeErrorCallback = () => {};

    async function start() {
      setScannerError(null);
      const scanner = new Html5Qrcode(regionId, {
        verbose: false,
        formatsToSupport: SUPPORTED,
        useBarCodeDetectorIfSupported: false,
      });
      liveScanner = scanner;

      if (cancelled) {
        tearDownHtml5Qrcode(scanner, regionId);
        liveScanner = null;
        return;
      }

      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 8,
            disableFlip: true,
          },
          (decodedText) => {
            if (cancelled || handledRef.current) return;
            const trimmed = decodedText.trim();
            if (!trimmed) return;
            handledRef.current = true;
            try {
              scanner.pause(false);
            } catch {
              /* ignore */
            }
            onDecodedRef.current(trimmed);
          },
          errorCb,
        );

        if (cancelled) {
          tearDownHtml5Qrcode(scanner, regionId);
          liveScanner = null;
        }
      } catch (e) {
        if (!cancelled) {
          setScannerError(formatStartError(e));
        }
        try {
          scanner.clear();
        } catch {
          /* ignore */
        }
        killMediaTracksUnderElement(regionId);
        liveScanner = null;
      }
    }

    void start();

    return () => {
      cancelled = true;
      const s = liveScanner;
      liveScanner = null;
      if (s) tearDownHtml5Qrcode(s, regionId);
    };
  }, [attempt, streamShouldRun, regionId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-camera-title"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-zinc-950 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 id="barcode-camera-title" className="truncate pr-2 text-lg font-semibold text-white">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] min-w-[88px] shrink-0 touch-manipulation rounded-lg border border-white/20 bg-white/10 px-4 py-3 text-base font-medium text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"
        >
          Close
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          id={regionId}
          className="tech-scan-html5-root h-full min-h-[min(50vh,320px)] w-full flex-1 overflow-hidden bg-black [&_video]:w-full [&_video]:object-cover"
          aria-hidden={Boolean(scannerError)}
        />

        {scannerError ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/95 px-4 text-center">
            <p className="max-w-md text-base text-amber-100" role="alert">
              {scannerError}
            </p>
            <button
              type="button"
              onClick={bumpRetry}
              className="min-h-[48px] min-w-[200px] touch-manipulation rounded-lg bg-white px-5 py-3 text-base font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-white/80"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={onClose}
              className="touch-manipulation text-sm text-white/80 underline underline-offset-2 hover:text-white"
            >
              Use keyboard instead
            </button>
          </div>
        ) : (
          <p className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 text-center text-sm text-white/90">
            Align the QR code. Submits automatically when it reads.
          </p>
        )}
      </div>
    </div>
  );
}
