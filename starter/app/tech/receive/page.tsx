"use client";

import { ScanLoadingLine, ScanWorkflowStatus } from "@/components/ScanWorkflowStatus";
import { TechScanCapture } from "@/components/TechScanCapture";
import { TechScanStepHeader } from "@/components/TechScanStepHeader";
import { useAutoDismiss } from "@/hooks/useAutoDismiss";
import type { ScanSource } from "@/lib/scan-flow";
import {
  createReceiveWorkflowDefinition,
  type ReceiveWorkflowMode,
} from "@/lib/tech-scan-workflows";
import { scanFlowProgress, useScanFlow } from "@/lib/tech-scan-flow";
import type { Asset } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function ReceiveFlowBody({
  mode,
  onToggleInputMethod,
  successBanner,
  setSuccessBanner,
}: {
  mode: ReceiveWorkflowMode;
  onToggleInputMethod: () => void;
  successBanner: string | null;
  setSuccessBanner: (v: string | null) => void;
}) {
  const workflow = useMemo(() => createReceiveWorkflowDefinition(mode), [mode]);

  const flow = useScanFlow(workflow, {
    onCompleteSuccess: (payload) => {
      const { asset, created } = payload as { asset: Asset; created: boolean };
      const locSummary = [asset.location.site, asset.location.room, asset.location.rack]
        .filter(Boolean)
        .join(" · ");
      const msg = created
        ? `Asset added — ${asset.asset_tag} at ${locSummary}.`
        : `Duplicate receive logged for ${asset.asset_tag} — nothing changed on file.`;
      setSuccessBanner(msg);
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

  const lookupStep =
    flow.currentStep.type === "receive_equipment" || flow.currentStep.type === "receive_serial";

  const scanLabel =
    (flow.currentStep.type === "receive_equipment" || flow.currentStep.type === "receive_serial") &&
    flow.context.assetTag
      ? `Asset ${flow.context.assetTag}`
      : undefined;

  const onAssetTagStep = flow.stepIndex === 0 && !flow.context.assetTag;

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-bold text-gray-900">Receiving — dock intake</h1>

      <ScanWorkflowStatus success={successBanner} error={flow.error} />

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-busy={flow.busy}>
        <TechScanStepHeader current={stepNum} total={stepTotal} label={ui.stepLabel} />

        <p className="text-sm leading-snug text-gray-700">{ui.instruction}</p>

        {flow.stepIndex > 0 && flow.context.assetTag ? (
          <p className="text-xs text-gray-600">
            Tag: <span className="font-semibold text-gray-900">{flow.context.assetTag}</span>
            {flow.context.serial ? (
              <>
                {" "}
                · Serial: <span className="font-semibold text-gray-900">{flow.context.serial}</span>
              </>
            ) : null}
            {flow.context.manufacturer ? (
              <>
                {" "}
                · Mfr: <span className="font-semibold text-gray-900">{flow.context.manufacturer}</span>
              </>
            ) : null}
            {flow.context.model ? (
              <>
                {" "}
                · Model: <span className="font-semibold text-gray-900">{flow.context.model}</span>
              </>
            ) : null}
            {flow.context.assetClass ? (
              <>
                {" "}
                · Type: <span className="font-semibold text-gray-900">{flow.context.assetClass}</span>
              </>
            ) : null}
            {flow.context.manualLocSite ? (
              <>
                {" "}
                · Loc site: <span className="font-semibold text-gray-900">{flow.context.manualLocSite}</span>
              </>
            ) : null}
            {flow.context.manualLocRoom ? (
              <>
                {" "}
                · Loc room: <span className="font-semibold text-gray-900">{flow.context.manualLocRoom}</span>
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
          label={scanLabel}
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

        {flow.stepIndex > 0 && !flow.busy ? (
          <button
            type="button"
            onClick={() => {
              setSuccessBanner(null);
              flow.reset();
            }}
            className="min-h-[44px] touch-manipulation text-base text-gray-700 underline hover:text-gray-900"
          >
            Restart flow from step 1
          </button>
        ) : null}
      </section>

      <p className="text-xs leading-snug text-gray-500">
        Sample payloads: <span className="font-medium text-gray-700">Dev → test barcodes</span>.
      </p>
    </div>
  );
}

export default function TechReceivePage() {
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [entryMode, setEntryMode] = useState<ReceiveWorkflowMode>("manual");

  useAutoDismiss(successBanner, setSuccessBanner, 3000);

  const toggleInputMethod = useCallback(() => {
    setSuccessBanner(null);
    setEntryMode((m) => (m === "manual" ? "camera" : "manual"));
  }, []);

  return (
    <ReceiveFlowBody
      mode={entryMode}
      onToggleInputMethod={toggleInputMethod}
      successBanner={successBanner}
      setSuccessBanner={setSuccessBanner}
    />
  );
}
