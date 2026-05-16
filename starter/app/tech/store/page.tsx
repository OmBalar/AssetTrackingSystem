"use client";

import { ScanLoadingLine, ScanWorkflowStatus } from "@/components/ScanWorkflowStatus";
import { TechScanCapturedSteps } from "@/components/TechScanCapturedSteps";
import { TechScanCapture } from "@/components/TechScanCapture";
import { TechScanStepHeader } from "@/components/TechScanStepHeader";
import { TechWorkflowSuccessBanner } from "@/components/TechWorkflowSuccessBanner";
import type { ScanSource } from "@/lib/scan-flow";
import { assetSuccessDetailRows, compactLocation, humanizeState } from "@/lib/tech-scan-helpers";
import {
  TECH_WORKFLOW_COMPLETED_SURFACE_COPY,
  scanFlowProgress,
  useScanFlow,
} from "@/lib/tech-scan-flow";
import { createStoreWorkflowDefinition, type StoreWorkflowMode } from "@/lib/tech-scan-workflows";
import type { Asset } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function StoreFlowBody({ mode, onToggleInputMethod }: { mode: StoreWorkflowMode; onToggleInputMethod: () => void }) {
  const workflow = useMemo(() => createStoreWorkflowDefinition(mode), [mode]);

  const flow = useScanFlow(workflow);

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    flow.reset();
  }, [mode, flow.reset]);

  const { current: stepNum, total: stepTotal } = scanFlowProgress(flow.stepIndex, flow.stepTotal);
  const ui = flow.currentStep.ui;
  const workflowDone = flow.phase === "completed";
  const surfaceInstruction = workflowDone ? TECH_WORKFLOW_COMPLETED_SURFACE_COPY.instruction : ui.instruction;
  const cameraModalTitle = workflowDone ? TECH_WORKFLOW_COMPLETED_SURFACE_COPY.cameraModalTitle : ui.cameraModalTitle;
  const cameraInstruction = workflowDone
    ? TECH_WORKFLOW_COMPLETED_SURFACE_COPY.cameraInstruction
    : ui.instruction;
  const scanPlaceholder = workflowDone ? TECH_WORKFLOW_COMPLETED_SURFACE_COPY.placeholder : ui.placeholder;
  const storedAsset =
    workflowDone && flow.completedPayload ? (flow.completedPayload as Asset) : null;

  const onScan = useCallback(
    (value: string, meta?: { source: ScanSource }) => flow.ingestScan(value, meta?.source ?? "keyboard"),
    [flow.ingestScan],
  );

  const hideCamera = mode === "manual";
  const autoCamera = mode === "camera";

  const onAssetTagStep = flow.stepIndex === 0 && !flow.context.assetTag;

  const successRibbon =
    workflowDone && storedAsset && flow.completedAtMs !== null ? (
      <TechWorkflowSuccessBanner
        key={flow.completedAtMs}
        headline="Asset stored successfully"
        details={assetSuccessDetailRows(storedAsset)}
        capturedSteps={flow.capturedSteps}
        persistHint="Expand for full details — hides when you scan the next asset tag (e.g. C0123456)."
        placement={mode === "camera" ? "bottom" : "top"}
      />
    ) : null;

  const pageVerticalInset =
    successRibbon == null
      ? " pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      : mode === "camera"
        ? " pb-[calc(6rem+env(safe-area-inset-bottom))]"
        : " pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[5.25rem]";

  const assetSummaryPanel =
    !workflowDone && flow.context.asset && flow.stepIndex > 0 ? (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
        <span className="font-medium">{flow.context.asset.asset_tag}</span>
        {" · state "}
        <span className="font-semibold">{humanizeState(flow.context.asset.state)}</span>
        <span className="mt-1 block text-xs text-gray-600">
          Current ops location:{" "}
          <span className="font-mono">{compactLocation(flow.context.asset.location)}</span>
        </span>
      </div>
    ) : null;

  return (
    <div className={`mx-auto max-w-lg space-y-6${pageVerticalInset}`}>
      <h1 className="text-2xl font-bold text-gray-900">Store — put-away</h1>

      <ScanWorkflowStatus error={workflowDone ? null : flow.error} />

      {successRibbon}

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-busy={flow.busy}>
        <TechScanStepHeader
          current={stepNum}
          total={stepTotal}
          label={ui.stepLabel}
          workflowCompleted={workflowDone}
        />

        <p className="text-sm leading-snug text-gray-700">{surfaceInstruction}</p>

        {mode !== "manual" ? assetSummaryPanel : null}

        {mode === "camera" && flow.stepIndex === 1 && !workflowDone ? (
          <p className="text-sm text-gray-700">
            One location QR: <span className="font-mono text-gray-900">SITE/ROOM/RACK</span> (slashes only).
          </p>
        ) : null}

        {mode !== "manual" ? (
          <TechScanCapturedSteps
            items={flow.capturedSteps}
            completedSession={workflowDone}
            nextStepLabel={!workflowDone ? ui.stepLabel : null}
          />
        ) : null}

        <TechScanCapture
          scanInputKey={flow.inputEpoch}
          disabled={flow.busy}
          autoFocus={flow.scanFieldAutofocus}
          hideCameraOption={hideCamera}
          autoOpenCameraOnStepChange={autoCamera}
          onCameraSessionDismissed={mode === "camera" ? onToggleInputMethod : undefined}
          label={flow.stepIndex > 0 ? `Asset ${flow.context.assetTag}` : undefined}
          placeholder={scanPlaceholder}
          cameraModalTitle={cameraModalTitle}
          cameraInstruction={cameraInstruction}
          scanStepAck={workflowDone ? null : flow.scanStepAck}
          workflowError={flow.error}
          workflowSuccessMessage={
            workflowDone
              ? mode === "camera"
                ? "Put-away saved — details are in the banner below."
                : "Put-away saved — details are in the banner above."
              : null
          }
          stepIndex={flow.stepIndex}
          stepLabel={workflowDone ? undefined : ui.stepLabel}
          cameraSessionCapturedSteps={flow.capturedSteps}
          onScan={onScan}
        />

        {mode === "manual" ? (
          <TechScanCapturedSteps
            items={flow.capturedSteps}
            completedSession={workflowDone}
            nextStepLabel={!workflowDone ? ui.stepLabel : null}
          />
        ) : null}

        {mode === "manual" ? assetSummaryPanel : null}

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

        {!workflowDone && flow.stepIndex > 0 && !flow.busy ? (
          <button
            type="button"
            onClick={() => flow.reset()}
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
  const [entryMode, setEntryMode] = useState<StoreWorkflowMode>("manual");

  const toggleInputMethod = useCallback(() => setEntryMode((m) => (m === "manual" ? "camera" : "manual")), []);

  return <StoreFlowBody mode={entryMode} onToggleInputMethod={toggleInputMethod} />;
}
