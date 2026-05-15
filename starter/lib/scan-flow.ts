import type { AssetClass, Location } from "@/lib/types";

/**
 * Where the decoded payload came from — used for focus / UX (keyboard wedge vs camera).
 */
export type ScanSource = "keyboard" | "camera";

/** Camera path: success banner visibility and scanner pause before the next decode (keep in sync with hardware scanner resume). */
export const CAMERA_STEP_SUCCESS_DISPLAY_MS = 500;

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

/** Builds a receive/store compact location barcode value (slash-separated, matches {@link parseCompactLocationBarcode}). */
export function formatCompactLocationBarcode(site: string, room: string, rack: string): string {
  return `${site.trim()}/${room.trim()}/${rack.trim()}`;
}

/**
 * Parses a single location barcode for receive/store (not deploy — deploy still uses full rack+RU, etc.).
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

/** @deprecated Use `parseCompactLocationBarcode` — kept for call sites that name the receive step. */
export const parseReceiveLocationBarcode = parseCompactLocationBarcode;
