import { api, ApiError } from "@/lib/api-client";
import { getCurrentUserId } from "@/lib/auth";
import { formatApiErrorForUser } from "@/lib/format-api-error";
import {
  COMPACT_LOCATION_BARCODE_EXAMPLE,
  isReceiveAssetTag,
  normalizeReceiveAssetTag,
  parseCompactLocationBarcode,
} from "@/lib/scan-flow";
import {
  isValidCustodianBadgePayload,
  isValidSerialPayload,
  looksLikeCompactLocationBarcode,
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

function serialConflictMessage(existingSerial: string, scannedSerial: string): string {
  return `Serial mismatch — file: ${existingSerial}, scanned: ${scannedSerial}. Check the sticker.`;
}

/** One segment of SITE/ROOM/RACK for manual entry — no slashes (one part per step). */
function manualLocationSegmentPartError(partLabel: string, raw: string): string | null {
  const s = raw.trim();
  if (!s) return `Enter ${partLabel} — cannot be empty.`;
  if (s.includes("/")) {
    return `${partLabel}: type this segment only — do not enter SITE/ROOM/RACK in one line (no slashes on manual location steps).`;
  }
  if (s.includes("|")) return `${partLabel} cannot contain |.`;
  if (looksLikeCompactLocationBarcode(s)) {
    return `That value is a full compact location QR — for manual entry, use three separate steps (site, room, rack).`;
  }
  return null;
}

const RECEIVE_FIRST_EQUIPMENT_STEP_INDEX = 1;

export type ReceiveWorkflowMode = "camera" | "manual";

export type StoreWorkflowMode = "camera" | "manual";

/** Receive: camera = tag + equipment QR + compact location QR. Manual = tag + 4 equipment fields + site + room + rack. */
export function createReceiveWorkflowDefinition(mode: ReceiveWorkflowMode): ScanFlowDefinition {
  const manualSplitEquipment = mode === "manual";

  const tagStep: ScanFlowStepDefinition = {
    type: "asset_tag",
    ui: {
      stepLabel: "Asset tag",
      placeholder: "Tag QR payload (C + 7 digits), Enter",
      cameraModalTitle: "Asset tag QR",
      instruction: "Scan the asset tag QR (payload must be C + 7 digits).",
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
      const parsed = parseReceiveEquipmentQr(raw);
      if (!parsed.ok) {
        return { outcome: "error", message: parsed.error, bumpInput: true };
      }
      const tag = ctx.assetTag;
      if (!tag) {
        return { outcome: "error", message: "Scan asset tag first.", bumpInput: true };
      }
      env.setLookupBusy(true);
      try {
        const existing = await lookupOperationsAsset(tag);
        if (existing) {
          const existingSerial = existing.serial.trim();
          if (existingSerial !== parsed.serial) {
            return {
              outcome: "error",
              message: serialConflictMessage(existingSerial, parsed.serial),
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
              message: serialConflictMessage(existingSerial, s),
              bumpInput: true,
            };
          }
        }
        return {
          outcome: "advance",
          patch: { serial: s },
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
        ack: "OK · model saved — enter asset type.",
      };
    },
  };

  const manualAssetTypeStep: ScanFlowStepDefinition = {
    type: "receive_asset_type",
    ui: {
      stepLabel: "Asset type",
      placeholder: "instrument, compute, network, power, consumable_durable — Enter",
      cameraModalTitle: "Asset type",
      instruction:
        "Type asset type: instrument, compute, network, power, or consumable_durable (one word, lowercase recommended).",
    },
    async process(raw) {
      const parsed = parseReceiveAssetTypeField(raw);
      if (!parsed.ok) {
        return { outcome: "error", message: parsed.error, bumpInput: true };
      }
      return {
        outcome: "advance",
        patch: { assetClass: parsed.asset_class },
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
      return { outcome: "complete", patch: { location } };
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
      return { outcome: "complete", patch: { location: parsed.location } };
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
  if (asset.state === "received" || asset.state === "in_service") return null;
  return `State is ${humanizeState(asset.state)} — store only from received or in service. Rescan if unsure.`;
}

function deployBlockedReason(asset: Asset): string | null {
  if (asset.state === "received" || asset.state === "stored") return null;
  return `State is ${humanizeState(asset.state)} — deploy only from received or stored.`;
}

function transferBlockedReason(asset: Asset): string | null {
  if (asset.state === "disposed" || asset.state === "unreceived") {
    return `State is ${humanizeState(asset.state)} — can't transfer custody.`;
  }
  return null;
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

/** Store: camera = tag + one compact location QR. Manual = tag + site, room, rack (one segment per step — no slashes). */
export function createStoreWorkflowDefinition(mode: StoreWorkflowMode): ScanFlowDefinition {
  const manualSplitLocation = mode === "manual";

  const tagStep: ScanFlowStepDefinition = {
    type: "asset_tag",
    ui: {
      stepLabel: "Asset tag",
      placeholder: "Tag QR payload (C + 7 digits), Enter",
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
      return { outcome: "complete", patch: { location: parsed.location } };
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
      return { outcome: "complete", patch: { location } };
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
            await api.mock.updateFacilities({
              tagged_id: ctx.assetTag,
              rack_location: null,
            });
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

/** Deploy: tag → site → room → rack → ru → POST deploy + mocks */
export function createDeployWorkflowDefinition(): ScanFlowDefinition {
  const steps: ScanFlowStepDefinition[] = [
    {
      type: "asset_tag",
      ui: {
        stepLabel: "Asset tag",
        placeholder: "Tag QR payload (C + 7 digits), Enter",
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
              deploy: { site: "", room: "", rack: "", ru: "" },
            },
            ack: `OK · ${tag} verified — scan site QR.`,
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
    },
    {
      type: "deploy_site",
      ui: {
        stepLabel: "Site / zone",
        placeholder: "Site QR payload, Enter",
        cameraModalTitle: "Site / zone QR",
        instruction: "Scan the site QR (single field — not SITE/ROOM/RACK).",
      },
      async process(raw, ctx) {
        const s = raw.trim();
        if (!s) return { outcome: "error", message: "Site required — scan label.", bumpInput: true };
        if (looksLikeCompactLocationBarcode(s)) {
          return {
            outcome: "error",
            message:
              "That QR encodes SITE/ROOM/RACK — this step expects only the site QR. Scan the site label.",
            bumpInput: true,
          };
        }
        return {
          outcome: "advance",
          patch: { deploy: { ...ctx.deploy, site: s } },
          ack: "OK · site recorded — scan room QR.",
        };
      },
    },
    {
      type: "deploy_room",
      ui: {
        stepLabel: "Bay / room",
        placeholder: "Room QR payload, Enter",
        cameraModalTitle: "Room / bay QR",
        instruction: "Scan the room QR (single field — not SITE/ROOM/RACK).",
      },
      async process(raw, ctx) {
        const s = raw.trim();
        if (!s) return { outcome: "error", message: "Room required — scan label.", bumpInput: true };
        if (looksLikeCompactLocationBarcode(s)) {
          return {
            outcome: "error",
            message:
              "That QR encodes SITE/ROOM/RACK — scan only the room QR for this step.",
            bumpInput: true,
          };
        }
        return {
          outcome: "advance",
          patch: { deploy: { ...ctx.deploy, room: s } },
          ack: "OK · room recorded — scan rack QR.",
        };
      },
    },
    {
      type: "deploy_rack",
      ui: {
        stepLabel: "Rack (cabinet) ID",
        placeholder: "Rack QR payload, Enter",
        cameraModalTitle: "Rack ID QR",
        instruction: "Scan the rack QR (single field — not SITE/ROOM/RACK).",
      },
      async process(raw, ctx) {
        const s = raw.trim();
        if (!s) return { outcome: "error", message: "Rack ID empty — rescan.", bumpInput: true };
        if (looksLikeCompactLocationBarcode(s)) {
          return {
            outcome: "error",
            message:
              "That QR encodes SITE/ROOM/RACK — scan only the rack QR for this step.",
            bumpInput: true,
          };
        }
        return {
          outcome: "advance",
          patch: { deploy: { ...ctx.deploy, rack: s } },
          ack: "OK · rack recorded — scan RU QR.",
        };
      },
    },
    {
      type: "deploy_ru",
      ui: {
        stepLabel: "RU / slot",
        placeholder: "RU QR payload, Enter",
        cameraModalTitle: "RU / slot QR",
        instruction: "Scan the rack unit (RU) QR — this submits deploy.",
      },
      async process(raw, ctx) {
        const ruTrim = raw.trim();
        if (!ruTrim) return { outcome: "error", message: "RU empty — scan rail sticker.", bumpInput: true };
        return { outcome: "complete", patch: { deploy: { ...ctx.deploy, ru: ruTrim } } };
      },
    },
  ];

  return {
    id: "deploy",
    steps,
    async onComplete(ctx): Promise<ScanFlowCompleteResult> {
      const loc: Location = {
        site: ctx.deploy.site.trim(),
        room: ctx.deploy.room.trim(),
        row: null,
        rack: ctx.deploy.rack.trim(),
        ru: ctx.deploy.ru.trim(),
      };
      if (!isDeployPlaceable(loc)) {
        return { ok: false, message: "Incomplete — need site, room, rack, RU (all scans)." };
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

/** Transfer: asset_tag → receiver badge → POST transfer */
export function createTransferWorkflowDefinition(operatorUserId: string): ScanFlowDefinition {
  const steps: ScanFlowStepDefinition[] = [
    {
      type: "asset_tag",
      ui: {
        stepLabel: "Asset tag",
        placeholder: "Tag QR payload (C + 7 digits), Enter",
        cameraModalTitle: "Asset tag QR",
        instruction: "Scan the asset tag QR changing custody.",
      },
      async process(raw, _ctx, env) {
        const tag = raw.trim().toUpperCase();
        if (!/^C\d{7}$/.test(tag)) {
          return { outcome: "error", message: SCAN_INVALID_TAG, bumpInput: true };
        }
        env.setLookupBusy(true);
        try {
          const fetched = await api.assets.get(tag);
          const blocked = transferBlockedReason(fetched);
          if (blocked) {
            return { outcome: "error", message: blocked, bumpInput: true };
          }
          return {
            outcome: "advance",
            patch: { assetTag: tag, asset: fetched },
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
    },
    {
      type: "custodian_badge",
      ui: {
        stepLabel: "Receiving badge",
        placeholder: "Custodian QR payload (tech-jane …), Enter",
        cameraModalTitle: "Custodian badge QR",
        instruction: "Scan the receiver’s badge QR (payload like tech-jane or manager-paul).",
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
            message: `Already custodian (${ctx.asset.custodian}) — scan the receiver.`,
            bumpInput: true,
          };
        }
        return { outcome: "complete", patch: { receiverId: badge } };
      },
    },
  ];

  return {
    id: "transfer",
    steps,
    async onComplete(ctx): Promise<ScanFlowCompleteResult> {
      const toCustodian = ctx.receiverId.trim();
      if (!toCustodian) {
        return { ok: false, message: "Badge empty — scan receiver ID, Enter." };
      }
      if (!ctx.asset) {
        return { ok: false, message: "No asset — scan tag first." };
      }
      try {
        const updated = await api.scans.transfer({
          asset_tag: ctx.assetTag,
          to_custodian: toCustodian,
          user_id: operatorUserId,
          scan_payload: `TRANSFER|${ctx.assetTag}|${toCustodian}`,
        });
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
