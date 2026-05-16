"use client";

import {
  type QrcodeErrorCallback,
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import { CAMERA_STEP_SUCCESS_DISPLAY_MS } from "@/lib/scan-flow";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type TechPersistentCameraScannerProps = {
  /** When false, the device capture stream is stopped until true again (tab hidden also stops the stream). */
  active: boolean;
  /** Pause decoding while keeping preview (e.g. flow busy / API round-trip). */
  scanPaused: boolean;
  /** Bump to force a fresh start while staying active (Use Camera while already in camera mode). */
  retryNonce?: number;
  /** Card includes header/footer chrome; plain is viewport-only for embedding in an overlay shell. */
  chrome?: "card" | "plain";
  title: string;
  footerHint?: string;
  /** Return `true` when the flow accepted the scan — camera waits before decoding again (success only). */
  onScan: (text: string) => boolean | void | Promise<boolean | void>;
  /** After an accepted scan, pause decodes this long (matches ingest success banner pacing). */
  successResumeDelayMs?: number;
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

const FORMATS = [Html5QrcodeSupportedFormats.QR_CODE];

/**
 * html5-qrcode may leave the camera active if `stop()` throws (e.g. internal state is still NOT_STARTED
 * during startup) or if `clear()` removes the video without `track.stop()`.
 */
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

export function TechPersistentCameraScanner({
  active,
  scanPaused,
  retryNonce = 0,
  chrome = "card",
  title,
  footerHint = "Hold the QR steady in the frame. Values submit through the scan pipeline.",
  onScan,
  successResumeDelayMs = CAMERA_STEP_SUCCESS_DISPLAY_MS,
}: TechPersistentCameraScannerProps) {
  const reactId = useId();
  const regionId = `tech-scan-region-${reactId.replace(/:/g, "")}`;
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const scanPausedRef = useRef(scanPaused);
  const cancelledRef = useRef(false);

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  scanPausedRef.current = scanPaused;

  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const streamShouldRun = active && pageVisible;

  const bumpRetry = useCallback(() => {
    setScannerError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    /** Set synchronously in start() right after `new Html5Qrcode` so unmount can always stop the instance. */
    let liveScanner: Html5Qrcode | null = null;

    if (!streamShouldRun) {
      cancelledRef.current = true;
      processingRef.current = false;
      const s = scannerRef.current ?? liveScanner;
      scannerRef.current = null;
      liveScanner = null;
      if (s) tearDownHtml5Qrcode(s, regionId);
      setScannerError(null);
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setScannerError("Camera needs HTTPS or localhost. Type the code instead.");
      return;
    }

    cancelledRef.current = false;

    const errorCb: QrcodeErrorCallback = () => {};

    async function start() {
      setScannerError(null);

      const scanner = new Html5Qrcode(regionId, {
        verbose: false,
        formatsToSupport: FORMATS,
        /** Avoid duplicate / overlapping detector surfaces on some Chromium builds. */
        useBarCodeDetectorIfSupported: false,
      });
      liveScanner = scanner;
      scannerRef.current = scanner;

      if (cancelledRef.current) {
        tearDownHtml5Qrcode(scanner, regionId);
        liveScanner = null;
        scannerRef.current = null;
        return;
      }

      try {
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            /** Full-frame avoids the shaded “inner box” that reads like a second QR preview on mobile. */
            disableFlip: true,
          },
          (decodedText) => {
            if (cancelledRef.current || processingRef.current || scanPausedRef.current) return;
            const trimmed = decodedText.trim();
            if (!trimmed) return;

            processingRef.current = true;

            void (async () => {
              let accepted = false;
              try {
                const outcome = await Promise.resolve(onScanRef.current(trimmed));
                accepted = outcome === true;
              } catch {
                accepted = false;
              }

              if (cancelledRef.current) {
                processingRef.current = false;
                return;
              }

              if (accepted && successResumeDelayMs > 0) {
                await new Promise((resolve) => window.setTimeout(resolve, successResumeDelayMs));
              }

              processingRef.current = false;
            })();
          },
          errorCb,
        );

        if (cancelledRef.current) {
          tearDownHtml5Qrcode(scanner, regionId);
          liveScanner = null;
          scannerRef.current = null;
        }
      } catch (e) {
        if (!cancelledRef.current) {
          setScannerError(formatStartError(e));
        }
        try {
          scanner.clear();
        } catch {
          /* ignore */
        }
        killMediaTracksUnderElement(regionId);
        liveScanner = null;
        scannerRef.current = null;
      }
    }

    void start();

    return () => {
      cancelledRef.current = true;
      processingRef.current = false;
      const s = scannerRef.current ?? liveScanner;
      scannerRef.current = null;
      liveScanner = null;
      if (s) tearDownHtml5Qrcode(s, regionId);
    };
  }, [streamShouldRun, regionId, retryNonce, attempt, successResumeDelayMs]);

  const viewport = (
    <div className="relative min-h-[min(52vh,420px)] flex-1 bg-black">
      <div
        id={regionId}
        className="tech-scan-html5-root h-full min-h-[280px] w-full overflow-hidden bg-black [&_video]:max-h-none [&_video]:min-h-[240px] [&_video]:w-full [&_video]:object-cover"
        aria-hidden={Boolean(scannerError)}
      />

      {scannerError ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/95 px-4 text-center">
          <p className="max-w-md text-sm text-amber-100" role="alert">
            {scannerError}
          </p>
          <button
            type="button"
            onClick={bumpRetry}
            className="min-h-[48px] min-w-[200px] touch-manipulation rounded-lg bg-white px-5 py-3 text-base font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-white/80"
          >
            Try again
          </button>
        </div>
      ) : (
        <p className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-3 pt-10 text-center text-xs text-white/85">
          {footerHint}
        </p>
      )}
    </div>
  );

  if (chrome === "plain") {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-black">
        <span className="sr-only">{title}</span>
        {viewport}
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-black shadow-inner">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-zinc-950 px-3 py-2">
        <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
        <span className="shrink-0 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-200">
          QR
        </span>
      </div>

      {viewport}
    </div>
  );
}
