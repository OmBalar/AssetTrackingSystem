"use client";

import { TechScanCapture } from "@/components/TechScanCapture";
import { TechScanStepHeader } from "@/components/TechScanStepHeader";
import { ScanLoadingLine, ScanWorkflowStatus } from "@/components/ScanWorkflowStatus";
import { useAutoDismiss } from "@/hooks/useAutoDismiss";
import type { ScanSource } from "@/lib/scan-flow";
import { humanizeState, compactLocation } from "@/lib/tech-scan-helpers";
import { scanFlowProgress, useScanFlow } from "@/lib/tech-scan-flow";
import { createStoreWorkflowDefinition, type StoreWorkflowMode } from "@/lib/tech-scan-workflows";
import type { Asset } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function StoreFlowBody({
  mode,
  onToggleInputMethod,
  successBanner,
  setSuccessBanner,
}: {
  mode: StoreWorkflowMode;
  onToggleInputMethod: () => void;
  successBanner: string | null;
  setSuccessBanner: (v: string | null) => void;
}) {
  const workflow = useMemo(() => createStoreWorkflowDefinition(mode), [mode]);

  const flow = useScanFlow(workflow, {
    onCompleteSuccess: (payload) => {
      const updated = payload as Asset;
      const locText = compactLocation(updated.location);
      setSuccessBanner(`Stored ${updated.asset_tag} — ${humanizeState(updated.state)} @ ${locText}`);
    },
  });

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    setSuccessBanner(null);
    flow.reset();
  }, [mode, flow.reset, setSuccessBanner]);

  const { current: stepNum, total: stepTotal } = scanFlowProgress(flow.stepIndex, flow.stepTotal);
  const ui = flow.currentStep.ui;

  const onScan = useCallback(
    (value: string, meta?: { source: ScanSource }) =>
      flow.ingestScan(value, meta?.source ?? "keyboard"),
    [flow.ingestScan],
  );

  const hideCamera = mode === "manual";
  const autoCamera = mode === "camera";

  const onAssetTagStep = flow.stepIndex === 0 && !flow.context.assetTag;

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-bold text-gray-900">Store — put-away</h1>

      <ScanWorkflowStatus success={successBanner} error={flow.error} />

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-busy={flow.busy}>
        <TechScanStepHeader current={stepNum} total={stepTotal} label={ui.stepLabel} />

        <p className="text-sm leading-snug text-gray-700">{ui.instruction}</p>

        {flow.context.asset && flow.stepIndex > 0 ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
            <span className="font-medium">{flow.context.asset.asset_tag}</span>
            {" · state "}
            <span className="font-semibold">{humanizeState(flow.context.asset.state)}</span>
            <span className="mt-1 block text-xs text-gray-600">
              Current ops location:{" "}
              <span className="font-mono">{compactLocation(flow.context.asset.location)}</span>
            </span>
          </div>
        ) : null}

        {mode === "camera" && flow.stepIndex === 1 ? (
          <p className="text-sm text-gray-700">
            One location QR: <span className="font-mono text-gray-900">SITE/ROOM/RACK</span> (slashes only).
          </p>
        ) : null}

        {mode === "manual" && flow.stepIndex > 0 && flow.context.assetTag ? (
          <p className="text-xs text-gray-600">
            Tag: <span className="font-semibold text-gray-900">{flow.context.assetTag}</span>
            {flow.context.manualLocSite ? (
              <>
                {" "}
                · Put-away site:{" "}
                <span className="font-semibold text-gray-900">{flow.context.manualLocSite}</span>
              </>
            ) : null}
            {flow.context.manualLocRoom ? (
              <>
                {" "}
                · Put-away room:{" "}
                <span className="font-semibold text-gray-900">{flow.context.manualLocRoom}</span>
              </>
            ) : null}
          </p>
        ) : null}

        <TechScanCapture
          scanInputKey={flow.inputEpoch}
          disabled={flow.busy}
          autoFocus={flow.scanFieldAutofocus}
          hideCameraOption={hideCamera}
          autoOpenCameraOnStepChange={autoCamera}
          onCameraSessionDismissed={mode === "camera" ? onToggleInputMethod : undefined}
          label={flow.stepIndex > 0 ? `Asset ${flow.context.assetTag}` : undefined}
          placeholder={ui.placeholder}
          cameraModalTitle={ui.cameraModalTitle}
          cameraInstruction={ui.instruction}
          scanStepAck={flow.scanStepAck}
          workflowError={flow.error}
          workflowSuccessMessage={successBanner}
          stepIndex={flow.stepIndex}
          stepLabel={ui.stepLabel}
          onScan={onScan}
        />

        {flow.lookupBusy && flow.stepIndex === 0 ? <ScanLoadingLine label="Looking up asset…" /> : null}
        {flow.submitBusy ? <ScanLoadingLine label="Storing…" /> : null}

        {onAssetTagStep && !flow.busy ? (
          <button
            type="button"
            onClick={onToggleInputMethod}
            className="min-h-[48px] w-full touch-manipulation rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            {mode === "manual" ? "Use camera for this flow" : "Use manual entry instead"}
          </button>
        ) : null}

        {flow.stepIndex > 0 && !flow.busy ? (
          <button
            type="button"
            onClick={() => {
              setSuccessBanner(null);
              flow.reset();
            }}
            className="min-h-[44px] touch-manipulation text-base text-gray-600 underline hover:text-gray-900"
          >
            Start over
          </button>
        ) : null}
      </section>
    </div>
  );
}

export default function TechStorePage() {
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<StoreWorkflowMode>("manual");

  useAutoDismiss(successBanner, setSuccessBanner, 6500);

  const toggleInputMethod = useCallback(() => {
    setSuccessBanner(null);
    setEntryMode((m) => (m === "manual" ? "camera" : "manual"));
  }, []);

  return (
    <StoreFlowBody
      mode={entryMode}
      onToggleInputMethod={toggleInputMethod}
      successBanner={successBanner}
      setSuccessBanner={setSuccessBanner}
    />
  );
}
