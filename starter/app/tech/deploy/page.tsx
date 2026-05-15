"use client";

import { TechScanCapture } from "@/components/TechScanCapture";
import { TechScanStepHeader } from "@/components/TechScanStepHeader";
import { ScanLoadingLine, ScanWorkflowStatus } from "@/components/ScanWorkflowStatus";
import { useAutoDismiss } from "@/hooks/useAutoDismiss";
import type { ScanSource } from "@/lib/scan-flow";
import { compactLocation, humanizeState } from "@/lib/tech-scan-helpers";
import { scanFlowProgress, useScanFlow } from "@/lib/tech-scan-flow";
import { createDeployWorkflowDefinition } from "@/lib/tech-scan-workflows";
import { useCallback, useMemo, useState } from "react";

type DeployScanUxMode = "keyboard" | "camera";

export default function TechDeployPage() {
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [scanUxMode, setScanUxMode] = useState<DeployScanUxMode>("keyboard");

  useAutoDismiss(successBanner, setSuccessBanner, 6500);

  const workflow = useMemo(() => createDeployWorkflowDefinition(), []);
  const flow = useScanFlow(workflow, {
    onCompleteSuccess: (payload) => {
      const { asset, locationLabel } = payload as { asset: { asset_tag: string }; locationLabel: string };
      setSuccessBanner(`Deployed ${asset.asset_tag} @ ${locationLabel} (mocks updated)`);
    },
  });

  const { current: stepNum, total: stepTotal } = scanFlowProgress(flow.stepIndex, flow.stepTotal);
  const ui = flow.currentStep.ui;

  const onScan = useCallback(
    (value: string, meta?: { source: ScanSource }) =>
      flow.ingestScan(value, meta?.source ?? "keyboard"),
    [flow.ingestScan],
  );

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-bold text-gray-900">Deploy — rack in-service</h1>

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

        <TechScanCapture
          scanInputKey={flow.inputEpoch}
          disabled={flow.busy}
          autoFocus={flow.scanFieldAutofocus}
          autoOpenCameraOnStepChange={scanUxMode === "camera"}
          onCameraSessionDismissed={scanUxMode === "camera" ? () => setScanUxMode("keyboard") : undefined}
          label={
            flow.currentStep.type === "deploy_site"
              ? `Asset ${flow.context.assetTag}`
              : flow.currentStep.type === "deploy_rack"
                ? `Room ${flow.context.deploy.room || "…"} · ${flow.context.deploy.site || "…"}`
                : undefined
          }
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

        {flow.stepIndex === 0 && !flow.context.assetTag && !flow.busy ? (
          <button
            type="button"
            onClick={() => {
              setSuccessBanner(null);
              setScanUxMode((m) => (m === "keyboard" ? "camera" : "keyboard"));
            }}
            className="min-h-[48px] w-full touch-manipulation rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-base font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            {scanUxMode === "keyboard" ? "Use camera for this flow" : "Use manual entry instead"}
          </button>
        ) : null}

        {flow.lookupBusy && flow.stepIndex === 0 ? <ScanLoadingLine label="Looking up asset…" /> : null}
        {flow.submitBusy ? <ScanLoadingLine label="Deploying…" /> : null}

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

      {flow.stepIndex > 0 ? (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">Tag:</span> {flow.context.assetTag}
          {flow.context.deploy.site ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Site:</span> {flow.context.deploy.site}
            </>
          ) : null}
          {flow.context.deploy.room ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Room:</span> {flow.context.deploy.room}
            </>
          ) : null}
          {flow.context.deploy.rack ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Rack:</span> {flow.context.deploy.rack}
            </>
          ) : null}
          {flow.context.deploy.ru ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">RU:</span> {flow.context.deploy.ru}
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
