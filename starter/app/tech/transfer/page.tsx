"use client";

import { ScanInput } from "@/components/ScanInput";
import { api, ApiError } from "@/lib/api-client";
import { getCurrentUserId } from "@/lib/auth";
import { formatApiErrorForUser } from "@/lib/format-api-error";
import type { Asset, Location } from "@/lib/types";
import { useCallback, useState } from "react";

const TAG_PATTERN = /^C\d{7}$/;

type Step = "tag" | "badge";

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

function transferBlockedReason(asset: Asset): string | null {
  if (asset.state === "disposed" || asset.state === "unreceived") {
    return `This asset is ${humanizeState(asset.state)}, so custody can't be transferred here. Pick a live unit (received, stored, in service, etc.).`;
  }
  return null;
}

export default function TechTransferPage() {
  const [step, setStep] = useState<Step>("tag");
  const [scanNonce, setScanNonce] = useState(0);
  const [assetTag, setAssetTag] = useState("");
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [tagLookupLoading, setTagLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const me = getCurrentUserId();
  const busy = submitting || tagLookupLoading;

  const bumpScanInput = useCallback(() => setScanNonce((n) => n + 1), []);

  const resetFlow = useCallback(() => {
    setStep("tag");
    setAssetTag("");
    setAsset(null);
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
        const blocked = transferBlockedReason(fetched);
        if (blocked) {
          setError(blocked);
          bumpScanInput();
          return;
        }
        setAssetTag(tag);
        setAsset(fetched);
        setStep("badge");
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

  const submitTransfer = useCallback(
    async (toCustodian: string) => {
      setError(null);
      if (!toCustodian) {
        setError("Badge scan was empty. Have the receiving tech scan their ID, then Enter.");
        bumpScanInput();
        return;
      }

      if (!asset) {
        setError("No asset loaded. Start over and scan the tag first.");
        bumpScanInput();
        return;
      }

      if (toCustodian === asset.custodian) {
        setError(
          `That badge is already the custodian on record (${asset.custodian}). Scan the person who is taking the handoff from you.`,
        );
        bumpScanInput();
        return;
      }

      setSubmitting(true);
      try {
        const updated = await api.scans.transfer({
          asset_tag: assetTag,
          to_custodian: toCustodian,
          user_id: me,
          scan_payload: `TRANSFER|${assetTag}|${toCustodian}`,
        });
        setSuccessBanner(
          `Custody for ${updated.asset_tag} is now ${updated.custodian}. State stayed ${humanizeState(updated.state)} at ${compactLocation(updated.location)}.`,
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
    [asset, assetTag, bumpScanInput, me, resetFlow],
  );

  const onBadgeScan = useCallback(
    (value: string) => {
      const badge = value.trim();
      if (!badge) return;
      void submitTransfer(badge);
    },
    [submitTransfer],
  );

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Custody handoff</h1>

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
        <h2 className="text-lg font-semibold text-gray-900">
          {step === "tag" ? "1 — Scan asset tag" : "2 — Scan receiving badge"}
        </h2>

        {asset && step === "badge" ? (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-800 space-y-1">
            <div>
              <span className="font-medium">{asset.asset_tag}</span>
              {" · "}
              <span className="font-semibold">{humanizeState(asset.state)}</span>
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Custodian now:</span>{" "}
              <span className="font-mono">{asset.custodian}</span>
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Location:</span>{" "}
              <span className="font-mono">{compactLocation(asset.location)}</span>
            </div>
            {me !== asset.custodian ? (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mt-2">
                Ops records <span className="font-mono">{asset.custodian}</span> as custodian, but
                you&apos;re logged in as <span className="font-mono">{me}</span>. The handoff event
                will still list you as the operator running this scan.
              </p>
            ) : null}
          </div>
        ) : null}

        <ScanInput
          key={`${step}-${scanNonce}`}
          disabled={busy}
          label={step === "badge" ? `Asset ${assetTag}` : undefined}
          placeholder={
            step === "tag"
              ? "Scan asset tag, then Enter…"
              : "Scan receiver user id (e.g. tech-mike), then Enter…"
          }
          onScan={step === "tag" ? (v) => void onTagScan(v) : onBadgeScan}
        />

        {step === "tag" && tagLookupLoading ? (
          <p className="text-sm text-gray-500" aria-live="polite">
            Loading asset from operations…
          </p>
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

      {step === "badge" ? (
        <p className="text-xs text-gray-500">
          <span className="font-medium text-gray-700">Tag:</span> {assetTag}
        </p>
      ) : null}
    </div>
  );
}
