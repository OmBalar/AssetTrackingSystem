"use client";

import { ScanInput } from "@/components/ScanInput";
import { api, ApiError } from "@/lib/api-client";
import { getCurrentUserId } from "@/lib/auth";
import { formatApiErrorForUser } from "@/lib/format-api-error";
import type { Asset, AssetClass, Location } from "@/lib/types";
import { useCallback, useState } from "react";

const TAG_PATTERN = /^C\d{7}$/;

type Step = "tag" | "serial" | "equipment" | "site" | "room" | "rack";

const ASSET_CLASS_OPTIONS: { value: AssetClass; label: string }[] = [
  { value: "instrument", label: "Instrument" },
  { value: "compute", label: "Compute" },
  { value: "network", label: "Network" },
  { value: "power", label: "Power" },
  { value: "consumable_durable", label: "Consumable (durable)" },
];

async function lookupOperationsAsset(tag: string): Promise<Asset | null> {
  try {
    return await api.assets.get(tag);
  } catch (e) {
    if (e instanceof ApiError && e.code === "unknown_asset") return null;
    throw e;
  }
}

function serialConflictMessage(existingSerial: string, scannedSerial: string): string {
  return `This tag is already in the system with serial ${existingSerial}. You scanned ${scannedSerial}. Stop and compare the sticker on the equipment — use the matching serial or a different asset tag.`;
}

export default function TechReceivePage() {
  const [step, setStep] = useState<Step>("tag");
  const [scanNonce, setScanNonce] = useState(0);
  const [assetTag, setAssetTag] = useState("");
  const [serial, setSerial] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClass>("instrument");
  const [site, setSite] = useState("");
  const [room, setRoom] = useState("");
  const [rack, setRack] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serialLookupLoading, setSerialLookupLoading] = useState(false);

  const busy = submitting || serialLookupLoading;

  const bumpScanInput = useCallback(() => setScanNonce((n) => n + 1), []);

  const resetFlow = useCallback(() => {
    setStep("tag");
    setAssetTag("");
    setSerial("");
    setManufacturer("");
    setModel("");
    setAssetClass("instrument");
    setSite("");
    setRoom("");
    setRack("");
    setError(null);
    bumpScanInput();
  }, [bumpScanInput]);

  const onTagScan = useCallback((value: string) => {
    const tag = value.trim().toUpperCase();
    setSuccessBanner(null);
    setError(null);
    if (!TAG_PATTERN.test(tag)) {
      setError(
        "That does not look like an asset tag. Expect C followed by seven digits (e.g. C0009001).",
      );
      bumpScanInput();
      return;
    }
    setAssetTag(tag);
    setStep("serial");
    bumpScanInput();
  }, [bumpScanInput]);

  const onSerialScan = useCallback(
    async (value: string) => {
      const s = value.trim();
      setError(null);
      if (!s) return;

      setSerialLookupLoading(true);
      try {
        const existing = await lookupOperationsAsset(assetTag);
        if (existing) {
          const existingSerial = existing.serial.trim();
          if (existingSerial !== s) {
            setError(serialConflictMessage(existingSerial, s));
            bumpScanInput();
            return;
          }
        }

        setSerial(s);
        setStep("equipment");
        bumpScanInput();
      } catch (e) {
        if (e instanceof ApiError) {
          setError(formatApiErrorForUser(e));
        } else {
          setError(
            "Can't reach the server to verify this tag. Check your connection and try again.",
          );
        }
        bumpScanInput();
      } finally {
        setSerialLookupLoading(false);
      }
    },
    [assetTag, bumpScanInput],
  );

  const onEquipmentContinue = useCallback(() => {
    const mfr = manufacturer.trim();
    const mdl = model.trim();
    setError(null);
    if (!mfr || !mdl) {
      setError("Enter both manufacturer and model (or scan if your labels carry them).");
      return;
    }
    setManufacturer(mfr);
    setModel(mdl);
    setStep("site");
    bumpScanInput();
  }, [bumpScanInput, manufacturer, model]);

  const onSiteScan = useCallback(
    (value: string) => {
      const s = value.trim();
      setError(null);
      if (!s) {
        setError("Site is required. Scan the site code on the receiving poster.");
        bumpScanInput();
        return;
      }
      setSite(s);
      setStep("room");
      bumpScanInput();
    },
    [bumpScanInput],
  );

  const onRoomScan = useCallback(
    (value: string) => {
      const s = value.trim();
      setError(null);
      if (!s) {
        setError("Room is required. Scan the dock or receiving room code.");
        bumpScanInput();
        return;
      }
      setRoom(s);
      setStep("rack");
      bumpScanInput();
    },
    [bumpScanInput],
  );

  const submitReceiveWithRack = useCallback(
    async (rackTrim: string) => {
      setError(null);

      if (!rackTrim || !site.trim() || !room.trim()) {
        setError(
          "Location data looks incomplete. Go back one step and re-scan site, room, and rack.",
        );
        return;
      }

      const location: Location = {
        site: site.trim(),
        room: room.trim(),
        row: null,
        rack: rackTrim,
        ru: null,
      };

      setSubmitting(true);
      try {
        const { asset, created } = await api.scans.receive({
          asset_tag: assetTag,
          serial: serial.trim(),
          model: model.trim(),
          manufacturer: manufacturer.trim(),
          asset_class: assetClass,
          location,
          user_id: getCurrentUserId(),
          scan_payload: `RECEIVE|${assetTag}|${serial.trim()}`,
        });
        const msg = created
          ? `Recorded receive for ${asset.asset_tag}. It is marked received at ${asset.location.site} / ${asset.location.room ?? ""} / ${asset.location.rack ?? ""}.`
          : `${asset.asset_tag} is already on file with the same serial. Nothing changed — we logged a duplicate receive.`;
        setSuccessBanner(msg);
        resetFlow();
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === "and_match_failed") {
            setSerial("");
            setStep("serial");
            bumpScanInput();
          }
          setError(formatApiErrorForUser(e));
        } else {
          setError("Could not reach the server. Check your connection and try again.");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      assetClass,
      assetTag,
      bumpScanInput,
      manufacturer,
      model,
      resetFlow,
      room,
      serial,
      site,
    ],
  );

  const onRackScan = useCallback(
    (value: string) => {
      const rackTrim = value.trim();
      setError(null);
      if (!rackTrim) {
        setError("Scan the dock lane or staging rack barcode.");
        bumpScanInput();
        return;
      }
      setRack(rackTrim);
      void submitReceiveWithRack(rackTrim);
    },
    [bumpScanInput, submitReceiveWithRack],
  );

  const stepTitle: Record<Step, string> = {
    tag: "1 — Scan asset tag",
    serial: "2 — Scan serial number",
    equipment: "3 — Equipment details",
    site: "4 — Scan site",
    room: "5 — Scan room",
    rack: "6 — Scan dock / staging rack",
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Receiving — dock intake</h1>

      {successBanner ? (
        <div
          className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-950 text-sm"
          role="status"
        >
          {successBanner}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 text-sm"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section
        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4"
        aria-busy={busy}
      >
        <h2 className="text-lg font-semibold text-gray-900">{stepTitle[step]}</h2>

        {(step === "tag" ||
          step === "serial" ||
          step === "site" ||
          step === "room" ||
          step === "rack") && (
          <>
            <ScanInput
              key={`${step}-${scanNonce}`}
              disabled={busy}
              label={step === "serial" ? `Asset ${assetTag}` : undefined}
              placeholder={scanPlaceholder(step)}
              onScan={
                step === "tag"
                  ? onTagScan
                  : step === "serial"
                    ? onSerialScan
                    : step === "site"
                      ? onSiteScan
                      : step === "room"
                        ? onRoomScan
                        : onRackScan
              }
            />
            {step === "serial" && serialLookupLoading ? (
              <p className="text-sm text-gray-500" aria-live="polite">
                Checking this tag against operations…
              </p>
            ) : null}
          </>
        )}

        {step === "equipment" ? (
          <div className="space-y-4">
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-2">
                Manufacturer
              </span>
              <input
                type="text"
                autoComplete="off"
                autoFocus
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full text-lg p-4 min-h-[44px] rounded-lg border-2 border-gray-300 focus:border-blue-600 focus:outline-none"
                placeholder="e.g. Acme"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-2">Model</span>
              <input
                type="text"
                autoComplete="off"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full text-lg p-4 min-h-[44px] rounded-lg border-2 border-gray-300 focus:border-blue-600 focus:outline-none"
                placeholder="e.g. Seq-9000"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-2">Class</span>
              <select
                value={assetClass}
                onChange={(e) => setAssetClass(e.target.value as AssetClass)}
                className="w-full text-lg p-4 min-h-[44px] rounded-lg border-2 border-gray-300 focus:border-blue-600 focus:outline-none bg-white"
              >
                {ASSET_CLASS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={onEquipmentContinue}
              className="w-full rounded-lg bg-blue-600 text-white text-lg font-medium py-4 min-h-[48px] hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
            >
              Continue to location scans
            </button>
          </div>
        ) : null}

        {step !== "tag" && !busy ? (
          <button
            type="button"
            onClick={resetFlow}
            className="text-sm text-gray-600 underline hover:text-gray-900"
          >
            Start over
          </button>
        ) : null}
      </section>

      {(step === "serial" ||
        step === "equipment" ||
        step === "site" ||
        step === "room" ||
        step === "rack") && (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">Tag:</span> {assetTag}
          {serial ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Serial:</span> {serial}
            </>
          ) : null}
          {(step === "equipment" ||
            step === "site" ||
            step === "room" ||
            step === "rack") &&
          (manufacturer.trim() || model.trim()) ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Mfr / model:</span>{" "}
              {manufacturer.trim()}
              {manufacturer.trim() && model.trim() ? " / " : ""}
              {model.trim()}
            </>
          ) : null}
          {(step === "room" || step === "rack") && site ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Site:</span> {site}
            </>
          ) : null}
          {step === "rack" && room ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Room:</span> {room}
            </>
          ) : null}
          {step === "rack" && rack ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Rack:</span> {rack}
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

function scanPlaceholder(step: Step): string {
  switch (step) {
    case "tag":
      return "Scan asset tag (C + seven digits), then Enter…";
    case "serial":
      return "Scan manufacturer serial, then Enter…";
    case "site":
      return "Scan site code, then Enter…";
    case "room":
      return "Scan room or bay code, then Enter…";
    case "rack":
      return "Scan dock lane / rack code, then Enter…";
    default:
      return "";
  }
}

