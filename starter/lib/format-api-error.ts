import { ApiError } from "./api-client.js";

function serialConflictMessage(existingSerial: string, scannedSerial: string): string {
  return `This tag is already in the system with serial ${existingSerial}. You scanned ${scannedSerial}. Stop and compare the sticker on the equipment — use the matching serial or a different asset tag.`;
}

function humanizeState(state: string): string {
  return state.replace(/_/g, " ");
}

export function formatApiErrorForUser(err: ApiError): string {
  if (err.code === "and_match_failed") {
    const expected = err.details?.expected_serial;
    const provided = err.details?.provided_serial;
    if (typeof expected === "string" && typeof provided === "string") {
      return serialConflictMessage(expected, provided);
    }
    return "This tag is already in the system with a different serial. Check the label and try again.";
  }
  if (err.code === "invalid_transition") {
    const from = err.details?.from_state;
    const attempted = err.details?.attempted_event;
    if (typeof from === "string" && attempted === "deploy") {
      return `This asset is ${humanizeState(from)} right now, so it can't go into service from this deploy scan. Deploy only works from received or stored. Rescan the tag or move it with the right workflow first.`;
    }
    if (typeof from === "string" && attempted === "store") {
      return `This asset is ${humanizeState(from)} right now, so it can't be placed in storage with this scan. Store only works from received or in service. Double-check the tag or the workflow.`;
    }
    if (typeof from === "string" && attempted === "transfer_custody") {
      return `This asset is ${humanizeState(from)}, so custody can't change with this scan — transfers only work once the unit is in play (not disposed or unreceived).`;
    }
    if (typeof from === "string") {
      return `This asset is ${humanizeState(from)} — that scan isn't valid for its current state. Check the barcode or workflow.`;
    }
    return "That action isn't allowed for this asset's current state. Check the tag or ask a supervisor.";
  }
  if (err.code === "incomplete_deploy_location") {
    return "Rack placement needs site, room, rack ID, and a rack-unit (RU) slot. Missing one usually means skipping a barcode — scan all four prompts or start over.";
  }
  if (err.code === "same_custodian") {
    const cust = err.details?.custodian;
    if (typeof cust === "string") {
      return `That badge is already the custodian on record (${cust}). Scan the person who is physically taking responsibility for the equipment.`;
    }
    return "That user is already the custodian. Scan the receiving party's badge instead.";
  }
  if (err.code === "invalid_tag_format") {
    return "Tags must look like C plus seven digits (example: C0009001). Scan the barcode again.";
  }
  if (err.code === "invalid_location") {
    return "The location data was rejected. Check site, room, and rack are filled in, then try again.";
  }
  if (err.code === "unknown_asset") {
    return "That asset tag is not in operations. Confirm the barcode or receive a brand-new tag.";
  }
  if (err.code === "missing_token") {
    return "The app server is missing API_TOKEN (see starter/.env). Set the token and restart the dev server.";
  }
  if (err.code === "internal_error") {
    return "The server reported an unexpected error. Try again in a few seconds. If it keeps happening, tell your supervisor.";
  }
  if (err.status === 429) {
    return "Too many requests right now — the lab API allows about 60 per minute. Wait a short moment and try again.";
  }
  if (err.status === 404) {
    return "Nothing matched that request in operations (404). Confirm the barcode or tap Start over.";
  }
  if (err.status >= 500) {
    return "The server returned an error. Try again shortly. If the problem persists, escalate to someone on-call.";
  }
  return err.message || "Something went wrong. Try again or ask a supervisor.";
}
