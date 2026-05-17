import type { AssetState, EventType } from "./types.js";

type Transition = {
  from: AssetState;
  to: AssetState;
  via: EventType;
};

export const TRANSITIONS: Transition[] = [
  { from: "unreceived", to: "received", via: "receive" },
  { from: "received", to: "stored", via: "store" },
  { from: "received", to: "in_service", via: "deploy" },
  { from: "stored", to: "in_service", via: "deploy" },
  { from: "stored", to: "disposed", via: "dispose" },
  { from: "in_service", to: "stored", via: "store" },
  { from: "in_service", to: "rma_pending", via: "rma_open" },
  { from: "in_service", to: "disposed", via: "dispose" },
  { from: "rma_pending", to: "received", via: "rma_receive_back" },
  { from: "rma_pending", to: "disposed", via: "dispose" },
];

export function isAllowedTransition(
  from: AssetState,
  to: AssetState,
  via: EventType,
): boolean {
  return TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.via === via,
  );
}

export function findTransition(
  from: AssetState,
  via: EventType,
): AssetState | null {
  const t = TRANSITIONS.find((t) => t.from === from && t.via === via);
  return t ? t.to : null;
}
