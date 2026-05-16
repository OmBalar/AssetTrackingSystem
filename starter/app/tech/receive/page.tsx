"use client";

import { ScanLoadingLine, ScanWorkflowStatus } from "@/components/ScanWorkflowStatus";
import { TechWorkflowSuccessBanner } from "@/components/TechWorkflowSuccessBanner";
import { TechScanCapturedSteps } from "@/components/TechScanCapturedSteps";
import { TechScanCapture } from "@/components/TechScanCapture";
import { TechScanStepHeader } from "@/components/TechScanStepHeader";
import { type ScanSource, isReceiveAssetTag } from "@/lib/scan-flow";
import {
  createReceiveWorkflowDefinition,
  type ReceiveWorkflowMode,
} from "@/lib/tech-scan-workflows";
import type { TechScanCapturedStep } from "@/lib/tech-scan-flow";
import { scanFlowProgress, useScanFlow } from "@/lib/tech-scan-flow";
import { assetSuccessDetailRows } from "@/lib/tech-scan-helpers";
import type { Asset } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function ReceiveFlowBody({ mode, onToggleInputMethod }: { mode: ReceiveWorkflowMode; onToggleInputMethod: () => void }) {
  const workflow = useMemo(() => createReceiveWorkflowDefinition(mode), [mode]);

  const [receiveConfirm, setReceiveConfirm] = useState<{
    asset: Asset;
    created: boolean;
    capturedSteps: readonly TechScanCapturedStep[];
    bannerKey: number;
  } | null>(null);

  const resetAfterSuccessRef = useRef<() => void>(() => {});
  const onReceiveCompleteSuccess = useCallback((payload?: unknown) => {
    const p = payload as { asset: Asset; created: boolean } | undefined;
    if (!p?.asset) return;
    setReceiveConfirm({
      asset: p.asset,
      created: p.created,
      capturedSteps: [...capturedStepsRef.current],
      bannerKey: Date.now(),
    });
    resetAfterSuccessRef.current();
  }, []);

  const flow = useScanFlow(workflow, { onCompleteSuccess: onReceiveCompleteSuccess });
  resetAfterSuccessRef.current = flow.reset;

  const capturedStepsRef = useRef(flow.capturedSteps);
  capturedStepsRef.current = flow.capturedSteps;

  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    setReceiveConfirm(null);
    flow.reset();
  }, [mode, flow.reset]);

  const { current: stepNum, total: stepTotal } = scanFlowProgress(flow.stepIndex, flow.stepTotal);
  const ui = flow.currentStep.ui;
  const workflowDone = flow.phase === "completed";

  const onScan = useCallback(
    (value: string, meta?: { source: ScanSource }) => {
      const trimmed = value.trim();
      if (trimmed && isReceiveAssetTag(trimmed)) {
        setReceiveConfirm(null);
      }
      return flow.ingestScan(value, meta?.source ?? "keyboard");
    },
    [flow.ingestScan],
  );

  const hideCamera = mode === "manual";
  const autoCamera = mode === "camera";

  const lookupStep =
    flow.currentStep.type === "receive_equipment" || flow.currentStep.type === "receive_serial";

  const scanLabel =
    (flow.currentStep.type === "receive_equipment" || flow.currentStep.type === "receive_serial") &&
    flow.context.assetTag
      ? `Asset ${flow.context.assetTag}`
      : undefined;

  const onAssetTagStep = flow.stepIndex === 0 && !flow.context.assetTag;

  return (
    <div
      className={`mx-auto max-w-lg space-y-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]${
        receiveConfirm ? " pt-[5.25rem]" : ""
      }`}
    >
      <h1 className="text-2xl font-bold text-gray-900">Receiving — dock intake</h1>

      <ScanWorkflowStatus error={workflowDone ? null : flow.error} />

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
          label={scanLabel}
          placeholder={ui.placeholder}
          cameraModalTitle={ui.cameraModalTitle}
          cameraInstruction={ui.instruction}
          scanStepAck={workflowDone ? null : flow.scanStepAck}
          workflowError={flow.error}
          workflowSuccessMessage={null}
          stepIndex={flow.stepIndex}
          stepLabel={workflowDone ? undefined : ui.stepLabel}
          cameraSessionCapturedSteps={flow.capturedSteps}
          onScan={onScan}
        />

        {flow.lookupBusy && lookupStep ? <ScanLoadingLine label="Verifying tag…" /> : null}
        {flow.submitBusy ? <ScanLoadingLine label="Saving receive…" /> : null}

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
            className="min-h-[44px] touch-manipulation text-base text-gray-700 underline hover:text-gray-900"
          >
            Restart flow from step 1
          </button>
        ) : null}
      </section>

      <p className="text-xs leading-snug text-gray-500">
        Sample payloads: <span className="font-medium text-gray-700">Dev → test barcodes</span>.
      </p>

      {receiveConfirm ? (
        <TechWorkflowSuccessBanner
          key={receiveConfirm.bannerKey}
          headline={receiveConfirm.created ? "Asset received" : "Duplicate receive (logged)"}
          details={assetSuccessDetailRows(receiveConfirm.asset)}
          capturedSteps={receiveConfirm.capturedSteps}
          persistHint="Expand for full details — hides when you scan the next asset tag (e.g. C0123456)."
        />
      ) : null}
    </div>
  );
}

export default function TechReceivePage() {
  const [entryMode, setEntryMode] = useState<ReceiveWorkflowMode>("manual");

  const toggleInputMethod = useCallback(() => setEntryMode((m) => (m === "manual" ? "camera" : "manual")), []);

  return <ReceiveFlowBody mode={entryMode} onToggleInputMethod={toggleInputMethod} />;
}
