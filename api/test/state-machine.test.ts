import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  findTransition,
  isAllowedTransition,
} from "../src/domain/state-machine.js";
import type { AssetState, EventType } from "../src/domain/types.js";

const ALL_STATES: AssetState[] = [
  "unreceived",
  "received",
  "stored",
  "in_service",
  "rma_pending",
  "disposed",
];
const ALL_EVENTS: EventType[] = [
  "receive",
  "store",
  "deploy",
  "rma_open",
  "rma_receive_back",
  "dispose",
  "duplicate_receive",
];

describe("state machine", () => {
  it("every defined transition is allowed", () => {
    for (const t of TRANSITIONS) {
      expect(isAllowedTransition(t.from, t.to, t.via)).toBe(true);
    }
  });

  it("rejects transitions not on the table", () => {
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        for (const via of ALL_EVENTS) {
          const defined = TRANSITIONS.some(
            (t) => t.from === from && t.to === to && t.via === via,
          );
          if (!defined) {
            expect(isAllowedTransition(from, to, via)).toBe(false);
          }
        }
      }
    }
  });

  it("findTransition returns the target state when transition exists", () => {
    expect(findTransition("received", "store")).toBe("stored");
    expect(findTransition("stored", "deploy")).toBe("in_service");
    expect(findTransition("received", "deploy")).toBe("in_service");
    expect(findTransition("in_service", "rma_open")).toBe("rma_pending");
    expect(findTransition("rma_pending", "rma_receive_back")).toBe("received");
  });

  it("findTransition returns null when no transition exists", () => {
    expect(findTransition("disposed", "deploy")).toBeNull();
    expect(findTransition("received", "rma_open")).toBeNull();
    expect(findTransition("unreceived", "store")).toBeNull();
  });
});
