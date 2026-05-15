"use client";

import { ScanInput } from "@/components/ScanInput";
import { api, ApiError } from "@/lib/api-client";
import { getCurrentUserId } from "@/lib/auth";
import { formatApiErrorForUser } from "@/lib/format-api-error";
import type { Asset, Location } from "@/lib/types";
import { useCallback, useState } from "react";

const TAG_PATTERN = /^C\d{7}$/;

type Step = "tag" | "site" | "room" | "rack" | "ru";

function humanizeState(state: string): string {
  return state.replace(/_/g, " ");
}

function compactLocation(loc: Location): string {
  const segments = [
    loc.site,
    loc.room ?? undefined,
    loc.row ?? undefined,
    loc.rack ?? undefined,
    loc.ru ?? undefined,
  ].filter((s): s is string => Boolean(s?.trim()));
  return segments.join(" / ");
}

function facilitiesRackPath(loc: Location): string {
  return [loc.site, loc.room, loc.row, loc.rack, loc.ru]
    .filter((s): s is string => Boolean(s?.trim()))
    .join("/");
}

function isDeployPlaceable(loc: Location): boolean {
  return Boolean(loc.site.trim() && loc.room?.trim() && loc.rack?.trim() && loc.ru?.trim());
}

function deployBlockedReason(asset: Asset): string | null {
  if (asset.state === "received" || asset.state === "stored") return null;
  return `This asset is ${humanizeState(asset.state)}, so it can't be rack-deployed yet — deploy only applies when it's received off the dock or sitting in storage. Rescan if the tag doesn't match the machine.`;
}

async function syncFacilitiesFinanceAfterDeploy(
  asset_tag: string,
  location: Location,
): Promise<void> {
  const rackPath = facilitiesRackPath(location);
  await api.mock.updateFacilities({
    tagged_id: asset_tag,
    rack_location: rackPath,
  });
  const capitalizedOn = new Date().toISOString().slice(0, 10);
  await api.mock.updateFinance({
    tag: asset_tag,
    site: location.site.trim(),
    status: "capitalized",
    capitalized_on: capitalizedOn,
  });
}

export default function TechDeployPage() {
  const [step, setStep] = useState<Step>("tag");
  const [scanNonce, setScanNonce] = useState(0);
  const [assetTag, setAssetTag] = useState("");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [site, setSite] = useState("");
  const [room, setRoom] = useState("");
  const [rack, setRack] = useState("");
  const [rackUnit, setRackUnit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [tagLookupLoading, setTagLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const busy = submitting || tagLookupLoading;

  const bumpScanInput = useCallback(() => setScanNonce((n) => n + 1), []);

  const resetFlow = useCallback(() => {
    setStep("tag");
    setAssetTag("");
    setAsset(null);
    setSite("");
    setRoom("");
    setRack("");
    setRackUnit("");
    setError(null);
    bumpScanInput();
  }, [bumpScanInput]);

  const onTagScan = useCallback(
    async (value: string) => {
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

      setTagLookupLoading(true);
      try {
        const fetched = await api.assets.get(tag);
        const blocked = deployBlockedReason(fetched);
        if (blocked) {
          setError(blocked);
          bumpScanInput();
          return;
        }
        setAssetTag(tag);
        setAsset(fetched);
        setSite("");
        setRoom("");
        setRack("");
        setRackUnit("");
        setStep("site");
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
        setTagLookupLoading(false);
      }
    },
    [bumpScanInput],
  );

  const onSiteScan = useCallback(
    (value: string) => {
      const s = value.trim();
      setError(null);
      if (!s) {
        setError("Site is required. Scan the bay or campus zone label.");
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
        setError("Room is required — deploy won't save without it.");
        bumpScanInput();
        return;
      }
      setRoom(s);
      setStep("rack");
      bumpScanInput();
    },
    [bumpScanInput],
  );

  const onRackScan = useCallback(
    (value: string) => {
      const s = value.trim();
      setError(null);
      if (!s) {
        setError("Rack barcode is blank. Scan the cabinet / frame ID.");
        bumpScanInput();
        return;
      }
      setRack(s);
      setStep("ru");
      bumpScanInput();
    },
    [bumpScanInput],
  );

  const submitDeploy = useCallback(
    async (ruTrim: string) => {
      setError(null);
      const loc: Location = {
        site: site.trim(),
        room: room.trim(),
        row: null,
        rack: rack.trim(),
        ru: ruTrim,
      };

      if (!isDeployPlaceable(loc)) {
        setError(
          "Location still incomplete — site, room, rack, and RU must all come from barcode scans.",
        );
        bumpScanInput();
        return;
      }

      setSubmitting(true);
      try {
        const deployed = await api.scans.deploy({
          asset_tag: assetTag,
          location: loc,
          user_id: getCurrentUserId(),
          scan_payload: `DEPLOY|${assetTag}|${compactLocation(loc)}`,
        });

        try {
          await syncFacilitiesFinanceAfterDeploy(deployed.asset_tag, loc);
        } catch (mockErr) {
          const locText = compactLocation(deployed.location);
          let extra = "";
          if (mockErr instanceof ApiError) {
            extra = ` ${formatApiErrorForUser(mockErr)}`;
          }
          setError(
            `${deployed.asset_tag} deployed in operations as in service at ${locText}, but syncing facilities/finance mocks failed.${extra}`,
          );
          bumpScanInput();
          return;
        }

        setSuccessBanner(
          `${deployed.asset_tag} is now in service at ${compactLocation(deployed.location)}. Facilities and finance mocks were updated.`,
        );
        resetFlow();
      } catch (e) {
        if (e instanceof ApiError) {
          setError(formatApiErrorForUser(e));
        } else {
          setError("Could not reach the server. Check your connection and try again.");
        }
        bumpScanInput();
      } finally {
        setSubmitting(false);
      }
    },
    [
      assetTag,
      bumpScanInput,
      rack,
      resetFlow,
      room,
      site,
    ],
  );

  const onRuScan = useCallback(
    (value: string) => {
      const ruTrim = value.trim();
      setError(null);
      if (!ruTrim) {
        setError("Rack unit (RU / U-height) can't be blank. Scan the sticker on the vertical rail.");
        bumpScanInput();
        return;
      }
      setRackUnit(ruTrim);
      void submitDeploy(ruTrim);
    },
    [bumpScanInput, submitDeploy],
  );

  const titles: Record<Step, string> = {
    tag: "1 — Scan asset tag",
    site: "2 — Scan site / zone",
    room: "3 — Scan bay / room",
    rack: "4 — Scan rack (cabinet) ID",
    ru: "5 — Scan rack unit (RU/U slot)",
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Deploy — rack in-service</h1>

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

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-4" aria-busy={busy}>
        <h2 className="text-lg font-semibold text-gray-900">{titles[step]}</h2>

        {asset && step !== "tag" ? (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800">
            <span className="font-medium">{asset.asset_tag}</span>
            {" · state "}
            <span className="font-semibold">{humanizeState(asset.state)}</span>
            <span className="text-gray-600 block mt-1 text-xs">
              Current ops location:{" "}
              <span className="font-mono">{compactLocation(asset.location)}</span>
            </span>
          </div>
        ) : null}

        {(step === "tag" ||
          step === "site" ||
          step === "room" ||
          step === "rack" ||
          step === "ru") && (
          <>
            <ScanInput
              key={`${step}-${scanNonce}`}
              disabled={busy}
              label={
                step === "site"
                  ? `Asset ${assetTag}`
                  : step === "rack"
                    ? `Room ${room || "…"} · ${site || "…"}`
                    : undefined
              }
              placeholder={placeholderFor(step)}
              onScan={
                step === "tag"
                  ? (v) => void onTagScan(v)
                  : step === "site"
                    ? onSiteScan
                    : step === "room"
                      ? onRoomScan
                      : step === "rack"
                        ? onRackScan
                        : onRuScan
              }
            />
            {step === "tag" && tagLookupLoading ? (
              <p className="text-sm text-gray-500" aria-live="polite">
                Loading asset from operations…
              </p>
            ) : null}
          </>
        )}

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

      {(step === "site" ||
        step === "room" ||
        step === "rack" ||
        step === "ru") && (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">Tag:</span> {assetTag}
          {(step === "room" || step === "rack" || step === "ru") && site ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Site:</span> {site}
            </>
          ) : null}
          {(step === "rack" || step === "ru") && room ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Room:</span> {room}
            </>
          ) : null}
          {(step === "rack" || step === "ru") && rack ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">Rack:</span> {rack}
            </>
          ) : null}
          {step === "ru" && rackUnit ? (
            <>
              {" "}
              · <span className="font-medium text-gray-700">RU:</span> {rackUnit}
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

function placeholderFor(step: Step): string {
  switch (step) {
    case "tag":
      return "Scan asset tag, then Enter…";
    case "site":
      return "Scan site / campus zone barcode, Enter…";
    case "room":
      return "Scan lab bay or phone room barcode, Enter…";
    case "rack":
      return "Scan cabinet / rack barcode, Enter…";
    case "ru":
      return "Scan RU/U position on the rails, Enter…";
    default:
      return "";
  }
}
