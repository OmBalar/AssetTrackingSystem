import { ApiError } from "./api-client.js";

function coerceDetailText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t.length ? t : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function formatAssetSerialMismatch(tag: string | null, expected: string | null, provided: string | null): string {
  const prefix = tag != null && tag.trim() !== "" ? `Asset ${tag.trim()}. ` : "";
  return `${prefix}On-file serial (ops): ${expected ?? "— unavailable"}. You scanned: ${provided ?? "—"}. Scan equipment whose serial matches the on-file value.`;
}

function humanizeState(state: string): string {
  return state.replace(/_/g, " ");
}

/** First Zod issue from API `details.issues` (Fastify receive/store body validation). */
function firstZodIssueSummary(details: Record<string, unknown> | undefined): string | null {
  const issues = details?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return null;
  const first = issues[0] as { path?: unknown; message?: unknown };
  if (typeof first.message !== "string" || !first.message) return null;
  const path = Array.isArray(first.path)
    ? first.path.map((p) => String(p)).filter((p) => p !== "")
    : [];
  const pathStr = path.length ? path.join(".") : "";
  return pathStr ? `${pathStr}: ${first.message}` : first.message;
}

/** Uses API `details.location` from incomplete_deploy_location (and similar). */
function missingDeployFieldLabels(details: Record<string, unknown> | undefined): string | null {
  const loc = details?.location;
  if (!loc || typeof loc !== "object") return null;
  const o = loc as Record<string, unknown>;
  const site = typeof o.site === "string" ? o.site.trim() : "";
  const room = o.room == null ? "" : String(o.room).trim();
  const rack = o.rack == null ? "" : String(o.rack).trim();
  const ru = o.ru == null ? "" : String(o.ru).trim();
  const missing: string[] = [];
  if (!site) missing.push("site");
  if (!room) missing.push("room");
  if (!rack) missing.push("rack");
  if (!ru) missing.push("RU");
  return missing.length ? missing.join(", ") : null;
}

export function formatApiErrorForUser(err: ApiError): string {
  if (err.code === "and_match_failed") {
    const tag = coerceDetailText(err.details?.asset_tag ?? err.details?.assetTag);
    const expected = coerceDetailText(err.details?.expected_serial ?? err.details?.expectedSerial);
    const provided = coerceDetailText(err.details?.provided_serial ?? err.details?.providedSerial);
    return formatAssetSerialMismatch(tag, expected, provided);
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
    const fields = missingDeployFieldLabels(err.details);
    if (fields) {
      return `Deploy location incomplete — missing: ${fields}. Scan the missing label(s), then try again.`;
    }
    return "Deploy location incomplete — need site, room, rack, and RU. Scan all four in order.";
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
  if (err.code === "invalid_receive_payload") {
    const z = firstZodIssueSummary(err.details);
    return z ? `Receive rejected — ${z}` : "Receive rejected — check all fields and try again.";
  }
  if (err.code === "invalid_location") {
    const z = firstZodIssueSummary(err.details);
    return z ? `Request didn't validate — ${z}` : "Location rejected — check site, room, rack, then scan again.";
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
