"use client";

import { ScanLoadingLine, ScanWorkflowStatus } from "@/components/ScanWorkflowStatus";
import { TechScanCapturedSteps } from "@/components/TechScanCapturedSteps";
import { TechScanCapture } from "@/components/TechScanCapture";
import { TechScanStepHeader } from "@/components/TechScanStepHeader";
import { TechWorkflowSuccessBanner } from "@/components/TechWorkflowSuccessBanner";
import { getCurrentUserId } from "@/lib/auth";
import type { ScanSource } from "@/lib/scan-flow";
import { assetSuccessDetailRows, compactLocation, humanizeState } from "@/lib/tech-scan-helpers";
import {
  TECH_WORKFLOW_COMPLETED_SURFACE_COPY,
  scanFlowProgress,
  useScanFlow,
} from "@/lib/tech-scan-flow";
import { createTransferWorkflowDefinition } from "@/lib/tech-scan-workflows";
import type { Asset } from "@/lib/types";
import { useCallback, useMemo, useState } from "react";

type TransferScanUxMode = "keyboard" | "camera";

export default function TechTransferPage() {
  const [scanUxMode, setScanUxMode] = useState<TransferScanUxMode>("keyboard");

  const me = getCurrentUserId();
  const workflow = useMemo(() => createTransferWorkflowDefinition(me), [me]);

  const flow = useScanFlow(workflow);

  const { current: stepNum, total: stepTotal } = scanFlowProgress(flow.stepIndex, flow.stepTotal);
  const ui = flow.currentStep.ui;
  const workflowDone = flow.phase === "completed";
  const surfaceInstruction = workflowDone ? TECH_WORKFLOW_COMPLETED_SURFACE_COPY.instruction : ui.instruction;
  const cameraModalTitle = workflowDone ? TECH_WORKFLOW_COMPLETED_SURFACE_COPY.cameraModalTitle : ui.cameraModalTitle;
  const cameraInstruction = workflowDone
    ? TECH_WORKFLOW_COMPLETED_SURFACE_COPY.cameraInstruction
    : ui.instruction;
  const scanPlaceholder = workflowDone ? TECH_WORKFLOW_COMPLETED_SURFACE_COPY.placeholder : ui.placeholder;
  const updatedAsset =
    workflowDone && flow.completedPayload ? (flow.completedPayload as Asset) : null;

  const onScan = useCallback(
    (value: string, meta?: { source: ScanSource }) => flow.ingestScan(value, meta?.source ?? "keyboard"),
    [flow.ingestScan],
  );

  const successRibbon =
    workflowDone && updatedAsset && flow.completedAtMs !== null ? (
      <TechWorkflowSuccessBanner
        key={flow.completedAtMs}
        headline="Custody transfer recorded successfully"
        details={assetSuccessDetailRows(updatedAsset)}
        capturedSteps={flow.capturedSteps}
        persistHint="Expand for full details — hides when you scan the next asset tag (e.g. C0123456)."
      />
    ) : null;

  return (
    <div
      className={`mx-auto max-w-lg space-y-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]${
        successRibbon ? " pt-[5.25rem]" : ""
      }`}
    >
      <h1 className="text-2xl font-bold text-gray-900">Custody handoff</h1>

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

        {!workflowDone && flow.context.asset && flow.stepIndex > 0 ? (
          <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
            <div>
              <span className="font-medium">{flow.context.asset.asset_tag}</span>
              {" · "}
              <span className="font-semibold">{humanizeState(flow.context.asset.state)}</span>
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Custodian now:</span>{" "}
              <span className="font-mono">{flow.context.asset.custodian}</span>
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Location:</span>{" "}
              <span className="font-mono">{compactLocation(flow.context.asset.location)}</span>
            </div>
            {me !== flow.context.asset.custodian ? (
              <p className="mt-2 rounded border border-amber-100 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                Custodian on file is <span className="font-mono">{flow.context.asset.custodian}</span>; you&apos;re{" "}
                <span className="font-mono">{me}</span> (operator is still you for this scan).
              </p>
            ) : null}
          </div>
        ) : null}

        <TechScanCapturedSteps
          items={flow.capturedSteps}
          completedSession={workflowDone}
          nextStepLabel={!workflowDone ? ui.stepLabel : null}
        />

        <TechScanCapture
          scanInputKey={flow.inputEpoch}
          disabled={flow.busy}
          autoFocus={flow.scanFieldAutofocus}
          autoOpenCameraOnStepChange={scanUxMode === "camera"}
          omitInlineModeControls
          onCameraSessionDismissed={scanUxMode === "camera" ? () => setScanUxMode("keyboard") : undefined}
          label={flow.stepIndex > 0 ? `Asset ${flow.context.assetTag}` : undefined}
          placeholder={scanPlaceholder}
          cameraModalTitle={cameraModalTitle}
          cameraInstruction={cameraInstruction}
          scanStepAck={workflowDone ? null : flow.scanStepAck}
          workflowError={flow.error}
          workflowSuccessMessage={
            workflowDone ? "Custody handoff recorded — details are in the banner above." : null
          }
          stepIndex={flow.stepIndex}
          stepLabel={workflowDone ? undefined : ui.stepLabel}
          cameraSessionCapturedSteps={flow.capturedSteps}
          onScan={onScan}
        />

        {!flow.busy ? (
          <button
            type="button"
            onClick={() => setScanUxMode((m) => (m === "keyboard" ? "camera" : "keyboard"))}
            className="min-h-[48px] w-full touch-manipulation rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            {scanUxMode === "keyboard" ? "Use camera for this flow" : "Use manual entry instead"}
          </button>
        ) : null}

        {flow.lookupBusy && flow.stepIndex === 0 ? <ScanLoadingLine label="Looking up asset…" /> : null}
        {flow.submitBusy ? <ScanLoadingLine label="Recording handoff…" /> : null}

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
