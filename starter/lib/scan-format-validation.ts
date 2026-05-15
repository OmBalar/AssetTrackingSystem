import { parseCompactLocationBarcode } from "@/lib/scan-flow";
import { SCAN_INVALID_RECEIVE_EQUIPMENT, SCAN_INVALID_SERIAL } from "@/lib/scan-messages";
import type { AssetClass } from "@/lib/types";

/** Asset tag QR payload: `C1234567` */
export const ASSET_TAG_PATTERN = /^C\d{7}$/;

/** Custodian badge QR: `tech-jane`, `manager-paul`, … */
export const CUSTODIAN_BADGE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/i;

export function isValidAssetTagPayload(raw: string): boolean {
  return ASSET_TAG_PATTERN.test(raw.trim().toUpperCase());
}

export function isValidSerialPayload(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  const upper = s.toUpperCase();
  if (ASSET_TAG_PATTERN.test(upper)) return false;
  if (/^SN-/i.test(s)) return /^SN-[A-Za-z0-9][A-Za-z0-9._-]*$/i.test(s);
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s);
}

export function isValidCompactLocationPayload(raw: string): boolean {
  return parseCompactLocationBarcode(raw).ok;
}

export function isValidCustodianBadgePayload(raw: string): boolean {
  return CUSTODIAN_BADGE_PATTERN.test(raw.trim());
}

/** Deploy single-field QR — not a three-part compact location barcode. */
export function looksLikeCompactLocationBarcode(raw: string): boolean {
  const t = raw.trim();
  if (!t || t.includes("|")) return false;
  const parts = t.split("/");
  return parts.length === 3 && parts.every((p) => p.trim().length > 0);
}

const ASSET_CLASS_SET: ReadonlySet<AssetClass> = new Set([
  "instrument",
  "compute",
  "network",
  "power",
  "consumable_durable",
]);

/** Receive step 2 — one QR encodes serial, manufacturer, model, and asset class. */
export function formatReceiveEquipmentQr(
  serial: string,
  manufacturer: string,
  model: string,
  assetClass: AssetClass,
): string {
  return `EQ:${serial.trim()}|${manufacturer.trim()}|${model.trim()}|${assetClass.trim()}`;
}

export type ParsedReceiveEquipment =
  | { ok: true; serial: string; manufacturer: string; model: string; asset_class: AssetClass }
  | { ok: false; error: string };

/**
 * Parses `EQ:serial|manufacturer|model|asset_class` (pipes only; serial must not look like an asset tag).
 */
export function parseReceiveEquipmentQr(raw: string): ParsedReceiveEquipment {
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith("eq:")) {
    return {
      ok: false,
      error: `${SCAN_INVALID_RECEIVE_EQUIPMENT} Example: EQ:SN-DEMO-001|Contoso|Analyzer A-100|instrument`,
    };
  }
  const body = trimmed.slice(3).trim();
  const parts = body.split("|").map((p) => p.trim());
  if (parts.length !== 4) {
    return {
      ok: false,
      error: `Equipment QR must have exactly four pipe-separated fields after EQ:. ${SCAN_INVALID_RECEIVE_EQUIPMENT}`,
    };
  }
  const [serial, manufacturer, model, acRaw] = parts;
  if (!serial || !manufacturer || !model || !acRaw) {
    return { ok: false, error: "Equipment QR fields must all be non-empty after EQ:." };
  }
  if (!isValidSerialPayload(serial)) {
    return { ok: false, error: SCAN_INVALID_SERIAL };
  }
  const ac = acRaw.toLowerCase() as AssetClass;
  if (!ASSET_CLASS_SET.has(ac)) {
    return {
      ok: false,
      error: `Unknown asset_type “${acRaw}”. Use instrument, compute, network, power, or consumable_durable.`,
    };
  }
  return { ok: true, serial, manufacturer, model, asset_class: ac };
}

export type ParsedReceiveAssetTypeField =
  | { ok: true; asset_class: AssetClass }
  | { ok: false; error: string };

/** Manual receive — one typed field for asset class only. */
export function parseReceiveAssetTypeField(raw: string): ParsedReceiveAssetTypeField {
  const t = raw.trim();
  if (!t) {
    return {
      ok: false,
      error: "Asset type required — instrument, compute, network, power, or consumable_durable.",
    };
  }
  const ac = t.toLowerCase() as AssetClass;
  if (!ASSET_CLASS_SET.has(ac)) {
    return {
      ok: false,
      error: `Unknown asset type “${t}”. Use instrument, compute, network, power, or consumable_durable.`,
    };
  }
  return { ok: true, asset_class: ac };
}
