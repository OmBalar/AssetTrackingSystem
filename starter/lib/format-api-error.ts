import { ApiError } from "./api-client.js";

function shortSerialConflict(expected: string, provided: string): string {
  return `Serial mismatch — file: ${expected}, scanned: ${provided}. Check the label.`;
}

function humanizeState(state: string): string {
  return state.replace(/_/g, " ");
}

export function formatApiErrorForUser(err: ApiError): string {
  if (err.code === "and_match_failed") {
    const expected = err.details?.expected_serial;
    const provided = err.details?.provided_serial;
    if (typeof expected === "string" && typeof provided === "string") {
      return shortSerialConflict(expected, provided);
    }
    return "Serial doesn't match what's on file for this tag. Rescan.";
  }
  if (err.code === "invalid_transition") {
    const from = err.details?.from_state;
    const attempted = err.details?.attempted_event;
    if (typeof from === "string" && attempted === "deploy") {
      return `Wrong state (${humanizeState(from)}) — deploy only from received or stored.`;
    }
    if (typeof from === "string" && attempted === "store") {
      return `Wrong state (${humanizeState(from)}) — store only from received or in service.`;
    }
    if (typeof from === "string" && attempted === "transfer_custody") {
      return `Wrong state (${humanizeState(from)}) — transfer needs an active unit.`;
    }
    if (typeof from === "string") {
      return `Wrong state (${humanizeState(from)}) for this action.`;
    }
    return "That action doesn't apply to this asset right now.";
  }
  if (err.code === "incomplete_deploy_location") {
    return "Need site, room, rack, and RU — scan all four in order.";
  }
  if (err.code === "same_custodian") {
    const cust = err.details?.custodian;
    if (typeof cust === "string") {
      return `That ID is already custodian (${cust}). Scan the receiver's badge.`;
    }
    return "Scan the receiving person's badge, not the current custodian.";
  }
  if (err.code === "invalid_tag_format") {
    return "Bad tag format — C + 7 digits. Rescan.";
  }
  if (err.code === "invalid_location") {
    return "Location rejected — check site, room, rack, then scan again.";
  }
  if (err.code === "unknown_asset") {
    return "Tag not in operations. Confirm barcode or receive new.";
  }
  if (err.code === "missing_token") {
    return "Server missing API_TOKEN (starter/.env). Set token, restart dev.";
  }
  if (err.code === "internal_error") {
    return "Server error — retry shortly.";
  }
  if (err.status === 429) {
    return "Rate limit — wait a few seconds, retry.";
  }
  if (err.status === 404) {
    return "Not found — confirm barcode or Start over.";
  }
  if (err.status >= 500) {
    return "Server error — retry shortly.";
  }
  return err.message || "Error — retry or escalate.";
}
