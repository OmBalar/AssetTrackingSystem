"use client";

import {
  type ScanSource,
  CAMERA_STEP_SUCCESS_DISPLAY_MS,
  scanFieldAutofocusAfterSource,
} from "@/lib/scan-flow";
import type { Asset, AssetClass, Location } from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";

/** Shared scan context for tech workflows (receive, store, deploy, transfer). */
export type TechScanFlowContext = {
  assetTag: string;
  serial: string;
  manufacturer: string;
  model: string;
  /** Populated after receive equipment QR / manual entry (camera vs keyboard). */
  assetClass: AssetClass | "";
  location: Location | null;
  /** Manual receive only — dock location split across three steps (site / room / rack). */
  manualLocSite: string;
  manualLocRoom: string;
  manualLocRack: string;
  asset: Asset | null;
  deploy: { site: string; room: string; rack: string; ru: string };
  receiverId: string;
};

export function emptyTechScanFlowContext(): TechScanFlowContext {
  return {
    assetTag: "",
    serial: "",
    manufacturer: "",
    model: "",
    assetClass: "",
    location: null,
    manualLocSite: "",
    manualLocRoom: "",
    manualLocRack: "",
    asset: null,
    deploy: { site: "", room: "", rack: "", ru: "" },
    receiverId: "",
  };
}

export type ScanStepUi = {
  stepLabel: string;
  placeholder: string;
  cameraModalTitle: string;
  instruction: string;
};

export type ScanFlowEnv = {
  setLookupBusy: (v: boolean) => void;
};

export type ScanStepOutcome =
  | { outcome: "advance"; patch?: Partial<TechScanFlowContext>; ack?: string; bumpInput?: boolean }
  | { outcome: "error"; message: string; bumpInput?: boolean }
  | { outcome: "complete"; patch?: Partial<TechScanFlowContext> }
  | { outcome: "noop" };

export type ScanFlowCompleteResult =
  | { ok: true; payload?: unknown }
  | {
      ok: false;
      message: string;
      retryStepIndex?: number;
      contextPatch?: Partial<TechScanFlowContext>;
    };

export type ScanFlowStepDefinition = {
  /** For debugging, camera terminal, and tests */
  type: string;
  ui: ScanStepUi;
  process: (
    raw: string,
    ctx: TechScanFlowContext,
    env: ScanFlowEnv,
  ) => Promise<ScanStepOutcome>;
};

export type ScanFlowDefinition = {
  id: string;
  steps: readonly ScanFlowStepDefinition[];
  onComplete: (ctx: TechScanFlowContext) => Promise<ScanFlowCompleteResult>;
};

/** Keyboard wedge: shorter pause between steps. */
const KEYBOARD_STEP_ACK_MS = 1500;

export type UseScanFlowOptions = {
  onCompleteSuccess?: (payload?: unknown) => void;
};

export type UseScanFlowResult = {
  flowId: string;
  stepIndex: number;
  stepTotal: number;
  currentStep: ScanFlowStepDefinition;
  context: TechScanFlowContext;
  scanFieldAutofocus: boolean;
  inputEpoch: number;
  scanStepAck: string | null;
  error: string | null;
  lookupBusy: boolean;
  submitBusy: boolean;
  busy: boolean;
  ingestScan: (raw: string, source: ScanSource) => Promise<boolean>;
  reset: () => void;
};

/**
 * Config-driven scan pipeline (ScanFlowController / step manager): each step runs `process`; the last step returns
 * `complete` and triggers `definition.onComplete(mergedContext)`. Decoded camera payloads are routed here via
 * `ingestScan`; the QR overlay owns one persistent scanner session until the tech closes it.
 */
export function useScanFlow(
  definition: ScanFlowDefinition,
  options: UseScanFlowOptions = {},
): UseScanFlowResult {
  const { onCompleteSuccess } = options;
  const { onComplete } = definition;

  const [stepIndex, setStepIndex] = useState(0);
  const [context, setContext] = useState<TechScanFlowContext>(emptyTechScanFlowContext);
  const contextRef = useRef(context);
  const stepIndexRef = useRef(stepIndex);
  contextRef.current = context;
  stepIndexRef.current = stepIndex;
  const [scanFieldAutofocus, setScanFieldAutofocus] = useState(true);
  const [inputEpoch, setInputEpoch] = useState(0);
  const [scanStepAck, setScanStepAck] = useState<string | null>(null);
  const stepAckClearMsRef = useRef(KEYBOARD_STEP_ACK_MS);
  const [error, setError] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);

  const busy = lookupBusy || submitBusy;
  const stepTotal = definition.steps.length;
  const currentStep = definition.steps[stepIndex] ?? definition.steps[0]!;

  const bumpInput = useCallback(() => setInputEpoch((n) => n + 1), []);

  useEffect(() => {
    if (!scanStepAck) return;
    const id = window.setTimeout(() => setScanStepAck(null), stepAckClearMsRef.current);
    return () => window.clearTimeout(id);
  }, [scanStepAck]);

  const reset = useCallback(() => {
    const empty = emptyTechScanFlowContext();
    contextRef.current = empty;
    setStepIndex(0);
    stepIndexRef.current = 0;
    setContext(empty);
    setScanStepAck(null);
    setError(null);
    setScanFieldAutofocus(true);
    bumpInput();
  }, [bumpInput]);

  const env: ScanFlowEnv = { setLookupBusy };

  const ingestScan = useCallback(
    async (raw: string, source: ScanSource): Promise<boolean> => {
      const autofocusNext = scanFieldAutofocusAfterSource(source);
      setScanFieldAutofocus(autofocusNext);
      setScanStepAck(null);
      setError(null);

      const idx = stepIndexRef.current;
      const step = definition.steps[idx];
      if (!step) return false;

      const ctx = contextRef.current;
      const result = await step.process(raw, ctx, env);

      if (result.outcome === "noop") return false;

      if (result.outcome === "error") {
        setError(result.message);
        if (result.bumpInput) bumpInput();
        return false;
      }

      if (result.outcome === "advance") {
        const base = contextRef.current;
        const patch = result.patch ?? {};
        const nextCtx: TechScanFlowContext = {
          ...base,
          ...patch,
          deploy: patch.deploy ? { ...base.deploy, ...patch.deploy } : base.deploy,
        };
        contextRef.current = nextCtx;
        setContext(nextCtx);
        if (result.ack) {
          stepAckClearMsRef.current =
            source === "camera" ? CAMERA_STEP_SUCCESS_DISPLAY_MS : KEYBOARD_STEP_ACK_MS;
          setScanStepAck(result.ack);
        }
        setStepIndex((i) => {
          const n = i + 1;
          stepIndexRef.current = n;
          return n;
        });
        if (result.bumpInput) bumpInput();
        return true;
      }

      // complete
      const base = contextRef.current;
      const patch = result.patch ?? {};
      const nextCtx: TechScanFlowContext = {
        ...base,
        ...patch,
        deploy: patch.deploy ? { ...base.deploy, ...patch.deploy } : base.deploy,
      };
      setSubmitBusy(true);
      try {
        const r = await onComplete(nextCtx);
        if (r.ok) {
          onCompleteSuccess?.(r.payload);
          reset();
          return true;
        } else {
          setError(r.message);
          if (r.retryStepIndex !== undefined) {
            setStepIndex(r.retryStepIndex);
            stepIndexRef.current = r.retryStepIndex;
            if (r.contextPatch) {
              const p = r.contextPatch;
              const base = contextRef.current;
              const u: TechScanFlowContext = {
                ...base,
                ...p,
                deploy: p.deploy ? { ...base.deploy, ...p.deploy } : base.deploy,
              };
              contextRef.current = u;
              setContext(u);
            }
          }
          bumpInput();
          return false;
        }
      } finally {
        setSubmitBusy(false);
      }
    },
    [bumpInput, definition.steps, onComplete, onCompleteSuccess, reset, definition],
  );

  return {
    flowId: definition.id,
    stepIndex,
    stepTotal,
    currentStep,
    context,
    scanFieldAutofocus,
    inputEpoch,
    scanStepAck,
    error,
    lookupBusy,
    submitBusy,
    busy,
    ingestScan,
    reset,
  };
}

export function scanFlowProgress(stepIndex: number, stepTotal: number): { current: number; total: number } {
  return { current: Math.min(stepIndex + 1, stepTotal), total: stepTotal };
}
