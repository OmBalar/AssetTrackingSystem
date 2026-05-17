import { api, ApiError } from "@/lib/api-client";
import { getCurrentUserId } from "@/lib/auth";
import { formatApiErrorForUser } from "@/lib/format-api-error";
import {
  COMPACT_LOCATION_BARCODE_EXAMPLE,
  COMPACT_LOCATION_BARCODE_LABEL,
  DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE,
  DEPLOY_COMPACT_LOCATION_BARCODE_LABEL,
  formatCompactLocationBarcode,
  formatDeployLocationBarcode,
  isReceiveAssetTag,
  normalizeReceiveAssetTag,
  parseCompactLocationBarcode,
  parseDeployLocationBarcode,
} from "@/lib/scan-flow";
import {
  isValidCustodianBadgePayload,
  isValidSerialPayload,
  parseReceiveAssetTypeField,
  parseReceiveEquipmentQr,
} from "@/lib/scan-format-validation";
import {
  SCAN_INVALID_CUSTODIAN,
  SCAN_INVALID_SERIAL,
  SCAN_INVALID_TAG,
  SCAN_NETWORK_DOWN,
} from "@/lib/scan-messages";
import type { Asset, Location } from "@/lib/types";
import { compactLocation, humanizeState, isDeployPlaceable } from "@/lib/tech-scan-helpers";
import type {
  ScanFlowCompleteResult,
  ScanFlowDefinition,
  ScanFlowStepDefinition,
  TechScanFlowContext,
} from "@/lib/tech-scan-flow";

function serialConflictMessage(assetTag: string, registeredSerial: string, scannedSerial: string): string {
  const tag = assetTag.trim();
  const registered = registeredSerial.trim();
  const scanned = scannedSerial.trim();
  const prefix = tag.length ? `Asset ${tag}. ` : "";
  const onFile = registered.length ? registered : "(no serial on record in ops)";
  return `${prefix}On-file serial (ops): ${onFile}. You scanned: ${scanned}. Use the equipment that matches the on-file serial.`;
}

/** One segment of SITE/ROOM/RACK for manual entry — no slashes (one part per step). QR flow uses {@link parseCompactLocationBarcode} instead. */
function manualLocationSegmentPartError(partLabel: string, raw: string): string | null {
  const s = raw.trim();
  if (!s) return `Enter ${partLabel} — cannot be empty.`;
  if (s.includes("/")) {
    return `${partLabel}: type this segment only — do not enter SITE/ROOM/RACK in one line (no slashes on manual location steps).`;
  }
  if (s.includes("|")) return `${partLabel} cannot contain |.`;
  return null;
}

const RECEIVE_FIRST_EQUIPMENT_STEP_INDEX = 1;

export type ReceiveWorkflowMode = "camera" | "manual";

export type StoreWorkflowMode = "camera" | "manual";

export type DeployWorkflowMode = "camera" | "manual";

/** Receive: camera = tag + equipment QR + compact location QR. Manual = tag + 4 equipment fields + site + room + rack. */
export function createReceiveWorkflowDefinition(mode: ReceiveWorkflowMode): ScanFlowDefinition {
  const manualSplitEquipment = mode === "manual";

  const tagStep: ScanFlowStepDefinition = {
    type: "asset_tag",
    ui: {
      stepLabel: "Asset tag",
      placeholder: "(C + 7 digits), Enter",
      cameraModalTitle: "Asset tag QR",
      instruction: "Scan the asset tag QR.",
    },
    async process(raw) {
      const tag = normalizeReceiveAssetTag(raw);
      if (!isReceiveAssetTag(tag)) {
        return { outcome: "error", message: SCAN_INVALID_TAG, bumpInput: true };
      }
      return {
        outcome: "advance",
        patch: {
          assetTag: tag,
          serial: "",
          manufacturer: "",
          model: "",
          assetClass: "",
          manualLocSite: "",
          manualLocRoom: "",
          manualLocRack: "",
        },
        capture: { label: tagStep.ui.stepLabel, value: tag },
        ack: `OK · tag ${tag}`,
      };
    },
  };

  const cameraEquipmentStep: ScanFlowStepDefinition = {
    type: "receive_equipment",
    ui: {
      stepLabel: "Serial · manufacturer · model · type",
      placeholder: "Equipment QR: EQ:serial|mfr|model|type — Enter",
      cameraModalTitle: "Equipment QR",
      instruction:
        "Scan the equipment QR: serial, manufacturer, model, and asset type in one payload (EQ:… with pipes — see dev barcodes).",
    },
    async process(raw, ctx, env) {
      const tag = ctx.assetTag.trim();
      if (!tag) {
        return { outcome: "error", message: "Scan asset tag first.", bumpInput: true };
      }

      env.setLookupBusy(true);
      try {
        const maybeReceiveTag = normalizeReceiveAssetTag(raw);
        if (isReceiveAssetTag(maybeReceiveTag)) {
          const existingHint = await lookupOperationsAsset(tag);
          const opsSerial = existingHint?.serial?.trim() ?? "";
          const serialLine =
            opsSerial.length > 0
              ? ` On-file serial (ops): ${opsSerial}. Scan the barcode that encodes that serial (EQ…), not the C-tag QR.`
              : " Scan the equipment QR (EQ:serial|…) for this asset, not another asset-tag read.";
          const head =
            maybeReceiveTag === tag
              ? `This step expects the equipment barcode — you scanned asset tag ${tag} again.`
              : `Scanned asset tag ${maybeReceiveTag}, but this flow is tagged ${tag}.`;

          return { outcome: "error", message: `${head}${serialLine}`, bumpInput: true };
        }

        const parsed = parseReceiveEquipmentQr(raw);
        if (!parsed.ok) {
          return { outcome: "error", message: parsed.error, bumpInput: true };
        }
        const existing = await lookupOperationsAsset(tag);
        if (existing) {
          const existingSerial = existing.serial.trim();
          if (existingSerial !== parsed.serial) {
            return {
              outcome: "error",
              message: serialConflictMessage(tag, existingSerial, parsed.serial),
              bumpInput: true,
            };
          }
        }
        return {
          outcome: "advance",
          patch: {
            serial: parsed.serial,
            manufacturer: parsed.manufacturer,
            model: parsed.model,
            assetClass: parsed.asset_class,
          },
          capture: {
            label: cameraEquipmentStep.ui.stepLabel,
            value: `${parsed.serial} · ${parsed.manufacturer} · ${parsed.model} · ${parsed.asset_class}`,
          },
          ack: "OK · equipment recorded — scan location QR.",
        };
      } catch (e) {
        if (e instanceof ApiError) {
          return { outcome: "error", message: formatApiErrorForUser(e), bumpInput: true };
        }
        return { outcome: "error", message: SCAN_NETWORK_DOWN, bumpInput: true };
      } finally {
        env.setLookupBusy(false);
      }
    },
  };

  const manualSerialStep: ScanFlowStepDefinition = {
    type: "receive_serial",
    ui: {
      stepLabel: "Serial number",
      placeholder: "Serial (SN-… or alphanumeric), Enter",
      cameraModalTitle: "Serial number",
      instruction: "Enter the manufacturer serial (alphanumeric or SN-… — not the C-tag). One field per page on manual entry.",
    },
    async process(raw, ctx, env) {
      const s = raw.trim();
      if (!s) return { outcome: "noop" };
      if (!isValidSerialPayload(s)) {
        return { outcome: "error", message: SCAN_INVALID_SERIAL, bumpInput: true };
      }
      const tag = ctx.assetTag;
      if (!tag) {
        return { outcome: "error", message: "Enter asset tag first.", bumpInput: true };
      }
      env.setLookupBusy(true);
      try {
        const existing = await lookupOperationsAsset(tag);
        if (existing) {
          const existingSerial = existing.serial.trim();
          if (existingSerial !== s) {
            return {
              outcome: "error",
              message: serialConflictMessage(tag, existingSerial, s),
              bumpInput: true,
            };
          }
        }
        return {
          outcome: "advance",
          patch: { serial: s },
          capture: { label: manualSerialStep.ui.stepLabel, value: s },
          ack: "OK · serial saved — enter manufacturer.",
        };
      } catch (e) {
        if (e instanceof ApiError) {
          return { outcome: "error", message: formatApiErrorForUser(e), bumpInput: true };
        }
        return { outcome: "error", message: SCAN_NETWORK_DOWN, bumpInput: true };
      } finally {
        env.setLookupBusy(false);
      }
    },
  };

  const manualManufacturerStep: ScanFlowStepDefinition = {
    type: "receive_manufacturer",
    ui: {
      stepLabel: "Manufacturer",
      placeholder: "Manufacturer name, Enter",
      cameraModalTitle: "Manufacturer",
      instruction: "Type the equipment manufacturer as printed on the asset.",
    },
    async process(raw) {
      const m = raw.trim();
      if (!m) return { outcome: "noop" };
      return {
        outcome: "advance",
        patch: { manufacturer: m },
        capture: { label: manualManufacturerStep.ui.stepLabel, value: m },
        ack: "OK · manufacturer saved — enter model.",
      };
    },
  };

  const manualModelStep: ScanFlowStepDefinition = {
    type: "receive_model",
    ui: {
      stepLabel: "Model",
      placeholder: "Model name or SKU, Enter",
      cameraModalTitle: "Model",
      instruction: "Type the model or SKU from the label.",
    },
    async process(raw) {
      const m = raw.trim();
      if (!m) return { outcome: "noop" };
      return {
        outcome: "advance",
        patch: { model: m },
        capture: { label: manualModelStep.ui.stepLabel, value: m },
        ack: "OK · model saved — enter asset type.",
      };
    },
  };

  const manualAssetTypeStep: ScanFlowStepDefinition = {
    type: "receive_asset_type",
    ui: {
      stepLabel: "Asset type",
      placeholder: "e.g. instrument, compute, network, power, consumable_durable — Enter",
      cameraModalTitle: "Asset type",
      instruction: "Type one of the supported asset categories for this equipment.",
    },
    async process(raw) {
      const parsed = parseReceiveAssetTypeField(raw);
      if (!parsed.ok) {
        return { outcome: "error", message: parsed.error, bumpInput: true };
      }
      return {
        outcome: "advance",
        patch: { assetClass: parsed.asset_class },
        capture: { label: manualAssetTypeStep.ui.stepLabel, value: parsed.asset_class },
        ack: "OK · equipment complete — enter location as three steps: site, room, rack.",
      };
    },
  };

  const manualLocationSiteStep: ScanFlowStepDefinition = {
    type: "receive_location_site",
    ui: {
      stepLabel: "Location · site",
      placeholder: "Site only, e.g. Lab-Building-A — Enter",
      cameraModalTitle: "Dock · site",
      instruction: `Type the site segment only (part 1 of 3 — matches the first part of ${COMPACT_LOCATION_BARCODE_EXAMPLE}). No slashes.`,
    },
    async process(raw) {
      const err = manualLocationSegmentPartError("site", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      return {
        outcome: "advance",
        patch: { manualLocSite: raw.trim() },
        capture: { label: manualLocationSiteStep.ui.stepLabel, value: raw.trim() },
        ack: "OK · site saved — enter room.",
      };
    },
  };

  const manualLocationRoomStep: ScanFlowStepDefinition = {
    type: "receive_location_room",
    ui: {
      stepLabel: "Location · room",
      placeholder: "Room / bay only, e.g. Receiving — Enter",
      cameraModalTitle: "Dock · room",
      instruction: `Type the room segment only (part 2 of 3 — middle segment of a compact location QR). No slashes.`,
    },
    async process(raw, ctx) {
      const err = manualLocationSegmentPartError("room", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      if (!ctx.manualLocSite.trim()) {
        return { outcome: "error", message: "Enter site first — restart flow if this step is wrong.", bumpInput: true };
      }
      return {
        outcome: "advance",
        patch: { manualLocRoom: raw.trim() },
        capture: { label: manualLocationRoomStep.ui.stepLabel, value: raw.trim() },
        ack: "OK · room saved — enter rack.",
      };
    },
  };

  const manualLocationRackStep: ScanFlowStepDefinition = {
    type: "receive_location_rack",
    ui: {
      stepLabel: "Location · rack",
      placeholder: "Rack / shelf ID only, e.g. DOCK-2 — Enter",
      cameraModalTitle: "Dock · rack",
      instruction:
        "Type the rack or shelf ID only (part 3 of 3 — last segment of a compact location QR). Enter submits the receive.",
    },
    async process(raw, ctx) {
      const err = manualLocationSegmentPartError("rack", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      if (!ctx.assetTag || !ctx.serial.trim() || !ctx.manufacturer.trim() || !ctx.model.trim() || !ctx.assetClass) {
        return { outcome: "error", message: "Flow incomplete — start over from asset tag.", bumpInput: true };
      }
      if (!ctx.manualLocSite.trim() || !ctx.manualLocRoom.trim()) {
        return { outcome: "error", message: "Enter site and room first — restart flow if needed.", bumpInput: true };
      }
      const rack = raw.trim();
      const location: Location = {
        site: ctx.manualLocSite.trim(),
        room: ctx.manualLocRoom.trim(),
        row: null,
        rack,
        ru: null,
      };
      return {
        outcome: "complete",
        patch: { location },
        capture: {
          label: manualLocationRackStep.ui.stepLabel,
          value: formatCompactLocationBarcode(ctx.manualLocSite.trim(), ctx.manualLocRoom.trim(), rack),
        },
      };
    },
  };

  const locationStep: ScanFlowStepDefinition = {
    type: "location_compact",
    ui: {
      stepLabel: "Dock location",
      placeholder: "Location QR payload SITE/ROOM/RACK, Enter",
      cameraModalTitle: "Location QR (SITE/ROOM/RACK)",
      instruction: `Scan one location QR: SITE/ROOM/RACK (slashes only, example ${COMPACT_LOCATION_BARCODE_EXAMPLE}). This submits the receive.`,
    },
    async process(raw, ctx) {
      const parsed = parseCompactLocationBarcode(raw);
      if (!parsed.ok) {
        return { outcome: "error", message: parsed.error, bumpInput: true };
      }
      if (!ctx.assetTag || !ctx.serial.trim() || !ctx.manufacturer.trim() || !ctx.model.trim() || !ctx.assetClass) {
        return { outcome: "error", message: "Flow incomplete — start over from asset tag.", bumpInput: true };
      }
      return {
        outcome: "complete",
        patch: { location: parsed.location },
        capture: {
          label: locationStep.ui.stepLabel,
          value: formatCompactLocationBarcode(
            parsed.location.site,
            parsed.location.room ?? "",
            parsed.location.rack ?? "",
          ),
        },
      };
    },
  };

  const steps: ScanFlowStepDefinition[] = manualSplitEquipment
    ? [
        tagStep,
        manualSerialStep,
        manualManufacturerStep,
        manualModelStep,
        manualAssetTypeStep,
        manualLocationSiteStep,
        manualLocationRoomStep,
        manualLocationRackStep,
      ]
    : [tagStep, cameraEquipmentStep, locationStep];

  return {
    id: manualSplitEquipment ? "receive-manual" : "receive-camera",
    steps,
    async onComplete(ctx): Promise<ScanFlowCompleteResult> {
      if (!ctx.location) {
        return { ok: false, message: "Missing location." };
      }
      if (!ctx.assetClass) {
        return { ok: false, message: "Missing equipment details — redo the equipment scan." };
      }
      try {
        const { asset, created } = await api.scans.receive({
          asset_tag: ctx.assetTag,
          serial: ctx.serial.trim(),
          model: ctx.model.trim(),
          manufacturer: ctx.manufacturer.trim(),
          asset_class: ctx.assetClass,
          location: ctx.location,
          user_id: getCurrentUserId(),
          scan_payload: `RECEIVE|${ctx.assetTag}|${ctx.serial.trim()}|${ctx.manufacturer.trim()}|${ctx.model.trim()}|${ctx.assetClass}`,
        });
        return { ok: true, payload: { asset, created } };
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === "and_match_failed") {
            return {
              ok: false,
              message: formatApiErrorForUser(e),
              retryStepIndex: RECEIVE_FIRST_EQUIPMENT_STEP_INDEX,
              contextPatch: {
                serial: "",
                manufacturer: "",
                model: "",
                assetClass: "",
                location: null,
                manualLocSite: "",
                manualLocRoom: "",
                manualLocRack: "",
              },
            };
          }
          return { ok: false, message: formatApiErrorForUser(e) };
        }
        return { ok: false, message: SCAN_NETWORK_DOWN };
      }
    },
  };
}

async function lookupOperationsAsset(tag: string): Promise<Asset | null> {
  try {
    return await api.assets.get(tag);
  } catch (e) {
    if (e instanceof ApiError && e.code === "unknown_asset") return null;
    throw e;
  }
}

function storeBlockedReason(asset: Asset): string | null {
  if (asset.state === "received" || asset.state === "in_service" || asset.state === "stored") return null;
  return `State is ${humanizeState(asset.state)} — store only when received, in service, or already stored (re-put-away). Rescan if unsure.`;
}

function deployBlockedReason(asset: Asset): string | null {
  if (asset.state === "received" || asset.state === "stored") return null;
  return `State is ${humanizeState(asset.state)} — deploy only from received or stored.`;
}

function transferBlockedReason(asset: Asset): string | null {
  if (asset.state === "received" || asset.state === "stored" || asset.state === "in_service") return null;
  return `State is ${humanizeState(asset.state)} — transfer only when received, stored, or in service.`;
}

type DeployMocksErrorBody = {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
};

/** Facilities + finance POSTs run in `app/api/sync/deploy-mocks` so the bearer token never executes in the browser. */
async function syncDeployMocksViaRoute(asset_tag: string, location: Location): Promise<void> {
  const res = await fetch("/api/sync/deploy-mocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset_tag, location }),
  });
  let json: DeployMocksErrorBody | null = null;
  try {
    json = (await res.json()) as DeployMocksErrorBody;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const code = json?.error?.code ?? "unknown_error";
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, code, message, json?.error?.details);
  }
}

/** Facilities de-rack POST runs in `app/api/sync/store-derack` so the bearer token never executes in the browser. */
async function syncStoreDerackViaRoute(asset_tag: string): Promise<void> {
  const res = await fetch("/api/sync/store-derack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ asset_tag }),
  });
  let json: DeployMocksErrorBody | null = null;
  try {
    json = (await res.json()) as DeployMocksErrorBody;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const code = json?.error?.code ?? "unknown_error";
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, code, message, json?.error?.details);
  }
}

/** Store: camera = tag + one compact location QR. Manual = tag + site, room, rack (one segment per step — no slashes). */
export function createStoreWorkflowDefinition(mode: StoreWorkflowMode): ScanFlowDefinition {
  const manualSplitLocation = mode === "manual";

  const tagStep: ScanFlowStepDefinition = {
    type: "asset_tag",
    ui: {
      stepLabel: "Asset tag",
      placeholder: "(C + 7 digits), Enter",
      cameraModalTitle: "Asset tag QR",
      instruction: "Scan the asset tag QR for put-away.",
    },
    async process(raw, _ctx, env) {
      const tag = raw.trim().toUpperCase();
      if (!/^C\d{7}$/.test(tag)) {
        return { outcome: "error", message: SCAN_INVALID_TAG, bumpInput: true };
      }
      env.setLookupBusy(true);
      try {
        const fetched = await api.assets.get(tag);
        const blocked = storeBlockedReason(fetched);
        if (blocked) {
          return { outcome: "error", message: blocked, bumpInput: true };
        }
        return {
          outcome: "advance",
          patch: {
            assetTag: tag,
            asset: fetched,
            manualLocSite: "",
            manualLocRoom: "",
            manualLocRack: "",
          },
          capture: { label: tagStep.ui.stepLabel, value: tag },
          ack: manualSplitLocation
            ? `OK · ${tag} verified — enter put-away location in three steps (site, then room, then rack).`
            : `OK · ${tag} verified — scan put-away location.`,
        };
      } catch (e) {
        if (e instanceof ApiError) {
          return { outcome: "error", message: formatApiErrorForUser(e), bumpInput: true };
        }
        return { outcome: "error", message: SCAN_NETWORK_DOWN, bumpInput: true };
      } finally {
        env.setLookupBusy(false);
      }
    },
  };

  const compactLocationStep: ScanFlowStepDefinition = {
    type: "location_compact",
    ui: {
      stepLabel: "Put-away location",
      placeholder: "Location QR SITE/ROOM/RACK, Enter",
      cameraModalTitle: "Put-away location QR",
      instruction: "One location QR: SITE/ROOM/RACK (slashes only — compact put-away location).",
    },
    async process(raw) {
      const parsed = parseCompactLocationBarcode(raw);
      if (!parsed.ok) {
        return { outcome: "error", message: parsed.error, bumpInput: true };
      }
      return {
        outcome: "complete",
        patch: { location: parsed.location },
        capture: {
          label: compactLocationStep.ui.stepLabel,
          value: formatCompactLocationBarcode(
            parsed.location.site,
            parsed.location.room ?? "",
            parsed.location.rack ?? "",
          ),
        },
      };
    },
  };

  const manualStoreSiteStep: ScanFlowStepDefinition = {
    type: "store_location_site",
    ui: {
      stepLabel: "Put-away · site",
      placeholder: "Site only, e.g. Lab-Building-A — Enter",
      cameraModalTitle: "Put-away site",
      instruction: `Enter the site only (part 1 of 3 — matches the first segment of ${COMPACT_LOCATION_BARCODE_EXAMPLE}). No slashes.`,
    },
    async process(raw) {
      const err = manualLocationSegmentPartError("site", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      return {
        outcome: "advance",
        patch: { manualLocSite: raw.trim() },
        capture: { label: manualStoreSiteStep.ui.stepLabel, value: raw.trim() },
        ack: "OK · site saved — enter room.",
      };
    },
  };

  const manualStoreRoomStep: ScanFlowStepDefinition = {
    type: "store_location_room",
    ui: {
      stepLabel: "Put-away · room",
      placeholder: "Room / bay only — Enter",
      cameraModalTitle: "Put-away room",
      instruction: `Enter the room only (part 2 of 3 — middle segment of ${COMPACT_LOCATION_BARCODE_EXAMPLE}). No slashes.`,
    },
    async process(raw, ctx) {
      const err = manualLocationSegmentPartError("room", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      if (!ctx.manualLocSite.trim()) {
        return { outcome: "error", message: "Enter site first — restart flow if this step is wrong.", bumpInput: true };
      }
      return {
        outcome: "advance",
        patch: { manualLocRoom: raw.trim() },
        capture: { label: manualStoreRoomStep.ui.stepLabel, value: raw.trim() },
        ack: "OK · room saved — enter rack.",
      };
    },
  };

  const manualStoreRackStep: ScanFlowStepDefinition = {
    type: "store_location_rack",
    ui: {
      stepLabel: "Put-away · rack",
      placeholder: "Rack / shelf ID only — Enter",
      cameraModalTitle: "Put-away rack",
      instruction:
        "Enter the rack or shelf ID only (part 3 of 3). Enter submits the store — do not type SITE/ROOM/RACK on one line.",
    },
    async process(raw, ctx) {
      const err = manualLocationSegmentPartError("rack", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      if (!ctx.assetTag || !ctx.asset) {
        return { outcome: "error", message: "Scan asset tag first.", bumpInput: true };
      }
      if (!ctx.manualLocSite.trim() || !ctx.manualLocRoom.trim()) {
        return { outcome: "error", message: "Enter site and room first — restart flow if needed.", bumpInput: true };
      }
      const rack = raw.trim();
      const location: Location = {
        site: ctx.manualLocSite.trim(),
        room: ctx.manualLocRoom.trim(),
        row: null,
        rack,
        ru: null,
      };
      return {
        outcome: "complete",
        patch: { location },
        capture: {
          label: manualStoreRackStep.ui.stepLabel,
          value: formatCompactLocationBarcode(ctx.manualLocSite.trim(), ctx.manualLocRoom.trim(), rack),
        },
      };
    },
  };

  const steps: ScanFlowStepDefinition[] = manualSplitLocation
    ? [tagStep, manualStoreSiteStep, manualStoreRoomStep, manualStoreRackStep]
    : [tagStep, compactLocationStep];

  return {
    id: manualSplitLocation ? "store-manual" : "store-camera",
    steps,
    async onComplete(ctx): Promise<ScanFlowCompleteResult> {
      if (!ctx.location) return { ok: false, message: "Missing location." };
      const priorState = ctx.asset?.state;
      try {
        const updated = await api.scans.store({
          asset_tag: ctx.assetTag,
          location: ctx.location,
          user_id: getCurrentUserId(),
          scan_payload: `STORE|${ctx.assetTag}|${compactLocation(ctx.location)}`,
        });
        if (priorState === "in_service") {
          try {
            await syncStoreDerackViaRoute(ctx.assetTag);
          } catch (mockErr) {
            const locText = compactLocation(updated.location);
            let extra = "";
            if (mockErr instanceof ApiError) {
              extra = formatApiErrorForUser(mockErr);
            }
            return {
              ok: false,
              message: extra
                ? `${updated.asset_tag} stored @ ${locText}; facilities derack failed: ${extra}`
                : `${updated.asset_tag} stored @ ${locText}; facilities derack failed. Retry or tell ops.`,
            };
          }
        }
        return { ok: true, payload: updated };
      } catch (e) {
        if (e instanceof ApiError) {
          return { ok: false, message: formatApiErrorForUser(e) };
        }
        return { ok: false, message: SCAN_NETWORK_DOWN };
      }
    },
  };
}

/** Deploy: camera = tag + one SITE/ROOM/RACK/RU QR. Manual = tag + site, room, rack, RU (one field per step). */
export function createDeployWorkflowDefinition(mode: DeployWorkflowMode): ScanFlowDefinition {
  const tagStep: ScanFlowStepDefinition = {
    type: "asset_tag",
    ui: {
      stepLabel: "Asset tag",
      placeholder: "(C + 7 digits), Enter",
      cameraModalTitle: "Asset tag QR",
      instruction: "Scan the asset tag QR to deploy to rack.",
    },
    async process(raw, _ctx, env) {
      const tag = raw.trim().toUpperCase();
      if (!/^C\d{7}$/.test(tag)) {
        return { outcome: "error", message: SCAN_INVALID_TAG, bumpInput: true };
      }
      env.setLookupBusy(true);
      try {
        const fetched = await api.assets.get(tag);
        const blocked = deployBlockedReason(fetched);
        if (blocked) {
          return { outcome: "error", message: blocked, bumpInput: true };
        }
        return {
          outcome: "advance",
          patch: {
            assetTag: tag,
            asset: fetched,
            deploy: { site: "", room: "", row: "", rack: "", ru: "" },
          },
          capture: { label: "Asset tag", value: tag },
          ack:
            mode === "camera"
              ? `OK · ${tag} verified — scan deploy location QR (${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL}).`
              : `OK · ${tag} verified — enter site, room, row, rack, and RU on separate screens.`,
        };
      } catch (e) {
        if (e instanceof ApiError) {
          return { outcome: "error", message: formatApiErrorForUser(e), bumpInput: true };
        }
        return { outcome: "error", message: SCAN_NETWORK_DOWN, bumpInput: true };
      } finally {
        env.setLookupBusy(false);
      }
    },
  };

  const deployLocationCompactStep: ScanFlowStepDefinition = {
    type: "deploy_location_compact",
    ui: {
      stepLabel: "Deploy location",
      placeholder: `Deploy QR ${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL}, Enter`,
      cameraModalTitle: "Deploy location QR",
      instruction: `Scan one deploy location QR: ${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL} (slashes only — example ${DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE}). This submits deploy.`,
    },
    async process(raw, _ctx) {
      const parsed = parseDeployLocationBarcode(raw);
      if (!parsed.ok) {
        const three = parseCompactLocationBarcode(raw);
        if (three.ok) {
          const hint = formatDeployLocationBarcode(
            three.location.site,
            three.location.room ?? "",
            three.location.row ?? "",
            three.location.rack ?? "",
            "U16",
          );
          return {
            outcome: "error",
            message: `That payload is ${COMPACT_LOCATION_BARCODE_LABEL} (three segments) for receive/store. Deploy needs ${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL} — add the row and RU. Example: ${hint}`,
            bumpInput: true,
          };
        }
        const tagProbe = normalizeReceiveAssetTag(raw);
        if (isReceiveAssetTag(tagProbe)) {
          return {
            outcome: "error",
            message: `This step expects the deploy location QR (${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL}), not asset tag ${tagProbe}.`,
            bumpInput: true,
          };
        }
        return { outcome: "error", message: parsed.error, bumpInput: true };
      }
      const loc = parsed.location;
      const nextDeploy = {
        site: loc.site.trim(),
        room: (loc.room ?? "").trim(),
        row: (loc.row ?? "").trim(),
        rack: (loc.rack ?? "").trim(),
        ru: (loc.ru ?? "").trim(),
      };
      return {
        outcome: "complete",
        patch: { deploy: nextDeploy },
        capture: {
          label: deployLocationCompactStep.ui.stepLabel,
          value: formatDeployLocationBarcode(nextDeploy.site, nextDeploy.room, nextDeploy.row, nextDeploy.rack, nextDeploy.ru),
        },
      };
    },
  };

  const manualDeploySiteStep: ScanFlowStepDefinition = {
    type: "deploy_site",
    ui: {
      stepLabel: "Site / zone",
      placeholder: "Site only (no slashes), Enter",
      cameraModalTitle: "Site / zone",
      instruction: `Type the site only (part 1 of 4 — first segment of ${DEPLOY_COMPACT_LOCATION_BARCODE_EXAMPLE}). No slashes.`,
    },
    async process(raw) {
      const err = manualLocationSegmentPartError("site", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      return {
        outcome: "advance",
        patch: { deploy: { site: raw.trim(), row: "", room: "", rack: "", ru: "" } },
        capture: { label: manualDeploySiteStep.ui.stepLabel, value: raw.trim() },
        ack: "OK · site recorded — enter room.",
      };
    },
  };

  const manualDeployRoomStep: ScanFlowStepDefinition = {
    type: "deploy_room",
    ui: {
      stepLabel: "Bay / room",
      placeholder: "Room only (no slashes), Enter",
      cameraModalTitle: "Room / bay",
      instruction: `Type the room only (part 2 of 5 — matches ${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL}). No slashes.`,
    },
    async process(raw, ctx) {
      const err = manualLocationSegmentPartError("room", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      if (!ctx.deploy.site.trim()) {
        return { outcome: "error", message: "Enter site first — restart flow if this step is wrong.", bumpInput: true };
      }
      return {
        outcome: "advance",
        patch: { deploy: { ...ctx.deploy, room: raw.trim() } },
        capture: { label: manualDeployRoomStep.ui.stepLabel, value: raw.trim() },
        ack: "OK · room recorded — enter row.",
      };
    },
  };

  const manualDeployRowStep: ScanFlowStepDefinition = {
    type: "deploy_row",
    ui: {
      stepLabel: "Row / aisle",
      placeholder: "Row only (no slashes), Enter",
      cameraModalTitle: "Row / aisle",
      instruction: `Type the row only (part 3 of 5 — matches ${DEPLOY_COMPACT_LOCATION_BARCODE_LABEL}). No slashes.`,
    },
    async process(raw, ctx) {
      const err = manualLocationSegmentPartError("row", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      if (!ctx.deploy.site.trim() || !ctx.deploy.room.trim()) {
        return { outcome: "error", message: "Enter site and room first — restart flow if needed.", bumpInput: true };
      }
      return {
        outcome: "advance",
        patch: { deploy: { ...ctx.deploy, row: raw.trim() } },
        capture: { label: manualDeployRowStep.ui.stepLabel, value: raw.trim() },
        ack: "OK · row recorded — enter rack ID.",
      };
    },
  };

  const manualDeployRackStep: ScanFlowStepDefinition = {
    type: "deploy_rack",
    ui: {
      stepLabel: "Rack (cabinet) ID",
      placeholder: "Rack ID only (no slashes), Enter",
      cameraModalTitle: "Rack ID",
      instruction: `Type the rack ID only (part 4 of 5). No slashes.`,
    },
    async process(raw, ctx) {
      const err = manualLocationSegmentPartError("rack", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      if (!ctx.deploy.site.trim() || !ctx.deploy.room.trim() || !ctx.deploy.row.trim()) {
        return { outcome: "error", message: "Enter site, room, and row first — restart flow if needed.", bumpInput: true };
      }
      return {
        outcome: "advance",
        patch: { deploy: { ...ctx.deploy, rack: raw.trim() } },
        capture: { label: manualDeployRackStep.ui.stepLabel, value: raw.trim() },
        ack: "OK · rack recorded — enter RU.",
      };
    },
  };

  const manualDeployRuStep: ScanFlowStepDefinition = {
    type: "deploy_ru",
    ui: {
      stepLabel: "RU / slot",
      placeholder: "RU only (e.g. U16, P-02), Enter",
      cameraModalTitle: "RU / slot",
      instruction: "Type the rack unit only (part 5 of 5). Enter submits deploy — no slashes.",
    },
    async process(raw, ctx) {
      const err = manualLocationSegmentPartError("RU / slot", raw);
      if (err) return { outcome: "error", message: err, bumpInput: true };
      if (!ctx.deploy.site.trim() || !ctx.deploy.room.trim() || !ctx.deploy.row.trim() || !ctx.deploy.rack.trim()) {
        return { outcome: "error", message: "Enter site, room, row, and rack first.", bumpInput: true };
      }
      const ru = raw.trim();
      const nextDeploy = { ...ctx.deploy, ru };
      return {
        outcome: "complete",
        patch: { deploy: nextDeploy },
        capture: {
          label: manualDeployRuStep.ui.stepLabel,
          value: `${ru} · ${formatDeployLocationBarcode(nextDeploy.site, nextDeploy.row, nextDeploy.room, nextDeploy.rack, ru)}`,
        },
      };
    },
  };

  const steps: ScanFlowStepDefinition[] =
    mode === "camera"
      ? [tagStep, deployLocationCompactStep]
      : [tagStep, manualDeploySiteStep, manualDeployRoomStep, manualDeployRowStep, manualDeployRackStep, manualDeployRuStep];

  return {
    id: mode === "camera" ? "deploy-camera" : "deploy-manual",
    steps,
    async onComplete(ctx): Promise<ScanFlowCompleteResult> {
      const loc: Location = {
        site: ctx.deploy.site.trim(),
        room: ctx.deploy.room.trim(),
        row: ctx.deploy.row.trim(),
        rack: ctx.deploy.rack.trim(),
        ru: ctx.deploy.ru.trim(),
      };
      if (!isDeployPlaceable(loc)) {
        return { ok: false, message: "Incomplete — need site, room, rack, RU (all fields)." };
      }
      try {
        const deployed = await api.scans.deploy({
          asset_tag: ctx.assetTag,
          location: loc,
          user_id: getCurrentUserId(),
          scan_payload: `DEPLOY|${ctx.assetTag}|${compactLocation(loc)}`,
        });
        try {
          await syncDeployMocksViaRoute(deployed.asset_tag, loc);
        } catch (mockErr) {
          const locText = compactLocation(deployed.location);
          let extra = "";
          if (mockErr instanceof ApiError) {
            extra = formatApiErrorForUser(mockErr);
          }
          return {
            ok: false,
            message: extra
              ? `${deployed.asset_tag} live @ ${locText}; mocks failed: ${extra}`
              : `${deployed.asset_tag} live @ ${locText}; facilities/finance sync failed. Retry or tell ops.`,
          };
        }
        return {
          ok: true,
          payload: { asset: deployed, locationLabel: compactLocation(deployed.location) },
        };
      } catch (e) {
        if (e instanceof ApiError) {
          return { ok: false, message: formatApiErrorForUser(e) };
        }
        return { ok: false, message: SCAN_NETWORK_DOWN };
      }
    },
  };
}


export function createTransferWorkflowDefinition(operatorUserId: string): ScanFlowDefinition {
  const assetTagStep: ScanFlowStepDefinition = {
    type: "asset_tag",
    ui: {
      stepLabel: "Asset tag",
      placeholder: "(C + 7 digits), Enter",
      cameraModalTitle: "Asset tag QR",
      instruction: "Scan the asset tag QR to transfer custody.",
    },
    async process(raw, _ctx, env) {
      const tag = raw.trim().toUpperCase();
      if (!/^C\d{7}$/.test(tag)) {
        return { outcome: "error", message: SCAN_INVALID_TAG, bumpInput: true };
      }
      env.setLookupBusy(true);
      try {
        const asset = await api.assets.get(tag);
        const blocked = transferBlockedReason(asset);
        if (blocked) {
          return { outcome: "error", message: blocked, bumpInput: true };
        }
        return {
          outcome: "advance",
          patch: { assetTag: tag, asset },
          capture: { label: "Asset tag", value: tag },
          ack: `OK · ${tag} verified — scan receiver badge.`,
        };
      } catch (e) {
        if (e instanceof ApiError) {
          return { outcome: "error", message: formatApiErrorForUser(e), bumpInput: true };
        }
        return { outcome: "error", message: SCAN_NETWORK_DOWN, bumpInput: true };
      } finally {
        env.setLookupBusy(false);
      }
    },
  };

  const receiverBadgeStep: ScanFlowStepDefinition = {
    type: "custodian_badge",
    ui: {
      stepLabel: "Receiver badge",
      placeholder: "Receiver badge payload, Enter",
      cameraModalTitle: "Receiver badge QR",
      instruction: "Scan the receiving custodian badge QR.",
    },
    async process(raw, ctx) {
      const badge = raw.trim();
      if (!badge) return { outcome: "noop" };
      if (!isValidCustodianBadgePayload(badge)) {
        return { outcome: "error", message: SCAN_INVALID_CUSTODIAN, bumpInput: true };
      }
      if (!ctx.asset) {
        return { outcome: "error", message: "No asset — scan tag first.", bumpInput: true };
      }
      if (badge === ctx.asset.custodian) {
        return {
          outcome: "error",
          message: `Already custodian (${ctx.asset.custodian}) — scan receiver.`,
          bumpInput: true,
        };
      }
      return {
        outcome: "complete",
        patch: { receiverId: badge },
        capture: { label: "Receiver badge", value: badge },
      };
    },
  };

  return {
    id: "transfer",
    steps: [assetTagStep, receiverBadgeStep],
    async onComplete(ctx): Promise<ScanFlowCompleteResult> {
      if (!ctx.asset) {
        return { ok: false, message: "No asset found — start again with its tag." };
      }
      const receiverId = ctx.receiverId?.trim() ?? "";
      if (!receiverId) {
        return { ok: false, message: "Receiver badge missing — scan receiver badge." };
      }
      try {
        const transferred = await api.scans.transfer({
          asset_tag: ctx.assetTag,
          to_custodian: receiverId,
          user_id: operatorUserId,
          scan_payload: `TRANSFER|${ctx.assetTag}|${receiverId}`,
        });
        return { ok: true, payload: { asset: transferred } };
      } catch (e) {
        if (e instanceof ApiError) {
          return { ok: false, message: formatApiErrorForUser(e) };
        }
        return { ok: false, message: SCAN_NETWORK_DOWN };
      }
    },
  };
}
