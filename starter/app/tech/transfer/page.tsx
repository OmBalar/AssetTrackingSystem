"use client";

import { ScanLoadingLine, ScanWorkflowStatus } from "@/components/ScanWorkflowStatus";
import { TechWorkflowSuccessBanner } from "@/components/TechWorkflowSuccessBanner";
import { TechScanCapturedSteps } from "@/components/TechScanCapturedSteps";
import { TechScanCapture } from "@/components/TechScanCapture";
import { TechScanStepHeader } from "@/components/TechScanStepHeader";
import type { ScanSource } from "@/lib/scan-flow";
import { assetSuccessDetailRows } from "@/lib/tech-scan-helpers";
import { scanFlowProgress, useScanFlow } from "@/lib/tech-scan-flow";
import { createTransferWorkflowDefinition } from "@/lib/tech-scan-workflows";
import { getCurrentUserId } from "@/lib/auth";
import type { Asset } from "@/lib/types";
import { useCallback, useMemo, useState } from "react";

export type TransferWorkflowMode = "camera" | "manual";

function TransferFlowBody({
  mode,
  onToggleInputMethod,
}: {
  mode: TransferWorkflowMode;
  onToggleInputMethod: () => void;
}) {
  const workflow = useMemo(() => createTransferWorkflowDefinition(getCurrentUserId()), []);
  const flow = useScanFlow(workflow);

  const { current: stepNum, total: stepTotal } = scanFlowProgress(flow.stepIndex, flow.stepTotal);
  const ui = flow.currentStep.ui;
  const workflowDone = flow.phase === "completed";
  const completedPayload = workflowDone && flow.completedPayload ? (flow.completedPayload as { asset: Asset }) : null;

  const onScan = useCallback(
    (value: string, meta?: { source: ScanSource }) => flow.ingestScan(value, meta?.source ?? "keyboard"),
    [flow.ingestScan],
  );

  const hideCamera = mode === "manual";
  const autoCamera = mode === "camera";
  const onAssetTagStep = flow.stepIndex === 0 && !flow.context.assetTag;

  const successRibbon =
    workflowDone && completedPayload?.asset && flow.completedAtMs !== null ? (
      <TechWorkflowSuccessBanner
        key={flow.completedAtMs}
        headline="Custody transfer completed"
        details={assetSuccessDetailRows(completedPayload.asset)}
        capturedSteps={flow.capturedSteps}
        persistHint="Expand for full details — hides when you scan the next asset tag."
        placement="bottom"
      />
    ) : null;

  const pageVerticalInset =
  successRibbon == null
    ? " pb-[max(1.25rem,env(safe-area-inset-bottom))]"
    : " pb-[calc(6rem+env(safe-area-inset-bottom))]";

  return (
    <div className={`mx-auto max-w-lg space-y-6${pageVerticalInset}`}>
      <h1 className="text-2xl font-bold text-gray-900">Custody transfer</h1>

      <ScanWorkflowStatus error={workflowDone ? null : flow.error} />

      {successRibbon}

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-busy={flow.busy}>
        <TechScanStepHeader
          current={stepNum}
          total={stepTotal}
          label={ui.stepLabel}
          workflowCompleted={workflowDone}
        />

        <p className="text-sm leading-snug text-gray-700">{ui.instruction}</p>

        <TechScanCapture
          scanInputKey={flow.inputEpoch}
          disabled={flow.busy}
          autoFocus={flow.scanFieldAutofocus}
          hideCameraOption={hideCamera}
          autoOpenCameraOnStepChange={autoCamera}
          onCameraSessionDismissed={mode === "camera" ? onToggleInputMethod : undefined}
          label={flow.stepIndex > 0 ? `Asset ${flow.context.assetTag}` : undefined}
          placeholder={workflowDone ? "Transfer complete — scan another asset tag." : ui.placeholder}
          cameraModalTitle={ui.cameraModalTitle}
          cameraInstruction={ui.instruction}
          scanStepAck={workflowDone ? null : flow.scanStepAck}
          workflowError={flow.error}
          workflowSuccessMessage={workflowDone ? "Transfer saved — details are in the banner below." : null}
          stepIndex={flow.stepIndex}
          stepLabel={workflowDone ? undefined : ui.stepLabel}
          cameraSessionCapturedSteps={flow.capturedSteps}
          onScan={onScan}
        />

        {onAssetTagStep && !flow.busy ? (
          <button
            type="button"
            onClick={onToggleInputMethod}
            className="min-h-[48px] w-full touch-manipulation rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            {mode === "manual" ? "Use camera for this flow" : "Use manual entry instead"}
          </button>
        ) : null}

        <TechScanCapturedSteps
          items={flow.capturedSteps}
          completedSession={workflowDone}
          nextStepLabel={!workflowDone ? ui.stepLabel : null}
        />

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

export default function TechTransferPage() {
  const [mode, setMode] = useState<TransferWorkflowMode>("manual");

  const onToggleInputMethod = useCallback(() => {
    setMode((prev) => (prev === "manual" ? "camera" : "manual"));
  }, []);

  return <TransferFlowBody mode={mode} onToggleInputMethod={onToggleInputMethod} />;
}
