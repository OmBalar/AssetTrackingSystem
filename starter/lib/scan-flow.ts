import type { AssetClass, Location } from "@/lib/types";

/**
 * Where the decoded payload came from — used for focus / UX (keyboard wedge vs camera).
 */
export type ScanSource = "keyboard" | "camera";

/**
 * Pause live QR decoding after a successful camera scan (`onScan` returned true) — keeps banners readable and avoids double-advance.
 */
export const CAMERA_ALERT_HOLD_MS = 2000;

/** @deprecated Prefer {@link CAMERA_ALERT_HOLD_MS}; synonym for callers that describe “success display”. */
export const CAMERA_STEP_SUCCESS_DISPLAY_MS = CAMERA_ALERT_HOLD_MS;

/** Prefer focusing the scan field on the next step only when the user is driving the wedge. */
export function scanFieldAutofocusAfterSource(source: ScanSource): boolean {
  return source === "keyboard";
}

/** API requires non-empty manufacturer/model — dock-fast receive uses placeholders. */
export const RECEIVE_API_EQUIPMENT_DEFAULTS = {
  manufacturer: "Unknown",
  model: "Unknown",
  asset_class: "instrument" as AssetClass,
};

const TAG_PATTERN = /^C\d{7}$/;

export function isReceiveAssetTag(value: string): boolean {
  return TAG_PATTERN.test(value.trim().toUpperCase());
}

export function normalizeReceiveAssetTag(value: string): string {
  return value.trim().toUpperCase();
}

export type ParsedCompactLocation = { ok: true; location: Location } | { ok: false; error: string };

/** Canonical compact location barcode: exactly three slash-separated segments (no pipes). */
export const COMPACT_LOCATION_BARCODE_LABEL = "SITE/ROOM/RACK" as const;

export const COMPACT_LOCATION_BARCODE_EXAMPLE = "Lab-Building-A/Receiving/DOCK-2" as const;

/** Deploy-only compact barcode: four slash-separated segments (includes RU). */
export const DEPLOY_COMPACT_LOCATION_BARCODE_LABEL = "SITE/ROOM/RACK/RU" as const;

export const DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE = "Lab-Building-A/Bay-12/B-04/U16" as const;

/** Builds a receive/store compact location barcode value (slash-separated, matches {@link parseCompactLocationBarcode}). */
export function formatCompactLocationBarcode(site: string, room: string, rack: string): string {
  return `${site.trim()}/${room.trim()}/${rack.trim()}`;
}

/** Builds deploy compact location barcode value (matches {@link parseDeployLocationBarcode}). */
export function formatDeployLocationBarcode(site: string, room: string, rack: string, ru: string): string {
  return `${site.trim()}/${room.trim()}/${rack.trim()}/${ru.trim()}`;
}

/**
 * Parses a single location barcode for receive/store.
 *
 * Format: exactly `SITE/ROOM/RACK` (slashes only — `|` is rejected so tooling and scanners stay consistent).
 * Row and RU are not encoded here; they are always null for this flow.
 */
export function parseCompactLocationBarcode(raw: string): ParsedCompactLocation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Location barcode empty." };
  }

  if (trimmed.includes("|")) {
    return {
      ok: false,
      error: `Use ${COMPACT_LOCATION_BARCODE_LABEL} with slashes only (no |). Example: ${COMPACT_LOCATION_BARCODE_EXAMPLE}.`,
    };
  }

  const parts = trimmed.split("/");
  if (parts.length !== 3) {
    return {
      ok: false,
      error: `Location must be ${COMPACT_LOCATION_BARCODE_LABEL} (three segments). Example: ${COMPACT_LOCATION_BARCODE_EXAMPLE}.`,
    };
  }

  const site = parts[0]!.trim();
  const room = parts[1]!.trim();
  const rack = parts[2]!.trim();

  if (!site || !room || !rack) {
    return {
      ok: false,
      error: `Each of site, room, and rack must be non-empty. Example: ${COMPACT_LOCATION_BARCODE_EXAMPLE}.`,
    };
  }

  return {
    ok: true,
    location: {
      site,
      room,
      row: null,
      rack,
      ru: null,
    },
  };
}

/**
 * Parses deploy rack location from one barcode (camera / wedge paste).
 *
 * Format: exactly `SITE/ROOM/RACK/RU` (slashes only, no `|`).
 */
export function parseDeployLocationBarcode(raw: string): ParsedCompactLocation {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Deploy location barcode empty." };
  }

  if (trimmed.includes("|")) {
    return {
      ok: false,
      error: `Use ${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL} with slashes only (no |). Example: ${DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE}.`,
    };
  }

  const parts = trimmed.split("/");
  if (parts.length !== 4) {
    return {
      ok: false,
      error: `Deploy location must be ${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL} (four segments). Example: ${DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE}.`,
    };
  }

  const site = parts[0]!.trim();
  const room = parts[1]!.trim();
  const rack = parts[2]!.trim();
  const ru = parts[3]!.trim();

  if (!site || !room || !rack || !ru) {
    return {
      ok: false,
      error: `Each of site, room, rack, and RU must be non-empty. Example: ${DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE}.`,
    };
  }

  return {
    ok: true,
    location: {
      site,
      room,
      row: null,
      rack,
      ru,
    },
  };
}

/** @deprecated Use `parseCompactLocationBarcode` — kept for call sites that name the receive step. */
export const parseReceiveLocationBarcode = parseCompactLocationBarcode;
