"use client";

import { api, ApiError } from "@/lib/api-client";
import { compactLocation, formatDateTimeShort, labelTitleCase } from "@/lib/format-display";
import { formatApiErrorForUser } from "@/lib/format-api-error";
import type { Asset, Event as AssetEvent } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

function summarizeStateTransition(ev: AssetEvent): string {
  const to = labelTitleCase(ev.to_state);
  if (ev.from_state == null) return to;
  return `${labelTitleCase(ev.from_state)} → ${to}`;
}

import type { ReconciliationItem } from "@/lib/reconciliation";

export function ManagerAssetDetail({
  routeTag,
  managerListHref,
  reconciliationItem,
}: {
  routeTag: string;
  managerListHref: string;
  reconciliationItem?: ReconciliationItem | null;
}) {
  const tag = routeTag.trim().toUpperCase();
  const [loading, setLoading] = useState(true);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setErrorMessage(null);
    setAsset(null);
    setEvents([]);

    Promise.all([api.assets.get(tag), api.assets.history(tag)])
      .then(([a, history]) => {
        if (!cancelled) {
          setAsset(a);
          setEvents(history);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        if (
          err instanceof ApiError &&
          (err.code === "unknown_asset" || err.status === 404)
        ) {
          setNotFound(true);
          return;
        }
        const msg =
          err instanceof ApiError ? formatApiErrorForUser(err) : "Couldn't load this asset.";
        setErrorMessage(msg);
      });

    return () => {
      cancelled = true;
    };
  }, [tag]);

  const emptyTimeline = events.length === 0;

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
        Loading asset {tag}…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <BackLink href={managerListHref} />
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-2">
          <h1 className="text-xl font-bold text-gray-900">Asset not found</h1>
          <p className="text-gray-600 text-sm">
            There is no record for <span className="font-mono font-medium">{tag}</span> in
            operations. Confirm the barcode or choose another tag from the dashboard.
          </p>
          <Link
            href="/manager"
            className="inline-block text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
          >
            Back to fleet
          </Link>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-4">
        <BackLink href={managerListHref} />
        <div className="rounded-xl border border-red-100 bg-red-50/70 p-6 text-red-900 text-sm shadow-sm">
          {errorMessage}
        </div>
      </div>
    );
  }

  if (!asset) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <BackLink href={managerListHref} />
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-bold text-gray-900 tabular-nums">{asset.asset_tag}</h1>
            <span className="inline-flex rounded-full border border-gray-300 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-800">
              {labelTitleCase(asset.state)}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            Custodian{" "}
            <span className="font-medium text-gray-900">{asset.custodian}</span>
            {" · "}Updated {formatDateTimeShort(asset.updated_at)}
          </p>
        </div>
      </div>

      {reconciliationItem && reconciliationItem.category !== "healthy" && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          reconciliationItem.category === "needs_review"
            ? "border-red-200 bg-red-50 text-red-900"
            : reconciliationItem.category === "drift"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-blue-200 bg-blue-50 text-blue-900"
        }`}>
          <p className="font-semibold">{reconciliationItem.headline}</p>
          <p className="mt-1 text-xs opacity-80">{reconciliationItem.explanation}</p>
          {reconciliationItem.suggested_actions.length > 0 && (
            <ul className="mt-2 list-disc ml-4 space-y-0.5 text-xs opacity-80">
              {reconciliationItem.suggested_actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <Link href="/manager/reconcile" className="mt-2 inline-block text-xs font-medium underline opacity-70 hover:opacity-100">
            View full reconciliation report →
          </Link>
        </div>
      )}
      <section
        aria-labelledby="summary-heading"
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h2 id="summary-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Summary
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <DetailPair label="Manufacturer" value={asset.manufacturer} />
          <DetailPair label="Model" value={asset.model} />
          <DetailPair label="Serial" value={<span className="font-mono">{asset.serial}</span>} />
          <DetailPair label="Asset class" value={labelTitleCase(asset.asset_class)} />
          <DetailPair
            label="Current location"
            value={compactLocation(asset.location)}
          />
          <DetailPair label="Custodian" value={asset.custodian} />
          <DetailPair label="Created" value={formatDateTimeShort(asset.created_at)} />
          <DetailPair label="Procurement note" value={asset.procurement_note ?? "—"} muted />
          <DetailPair
            label="Parent asset"
            value={
              asset.parent_asset_tag ? (
                <Link
                  className="font-mono text-blue-700 hover:underline"
                  href={`/manager/assets/${encodeURIComponent(asset.parent_asset_tag)}`}
                >
                  {asset.parent_asset_tag}
                </Link>
              ) : (
                "—"
              )
            }
          />
        </dl>
      </section>

      <section
        aria-labelledby="history-heading"
        className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
      >
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h2 id="history-heading" className="text-base font-semibold text-gray-900">
            Scan &amp; state history
          </h2>
          <p className="mt-1 text-xs text-gray-600">
            Newest first — every line is tied to who scanned what and when.
          </p>
        </div>
        {emptyTimeline ? (
          <p className="px-4 py-8 text-center text-sm text-gray-600">
            No events recorded yet for this asset.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/70 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <th className="whitespace-nowrap px-4 py-2">When</th>
                  <th className="whitespace-nowrap px-4 py-2">Event</th>
                  <th className="whitespace-nowrap px-4 py-2">State</th>
                  <th className="whitespace-nowrap px-4 py-2">Location movement</th>
                  <th className="whitespace-nowrap px-4 py-2">User</th>
                  <th className="px-4 py-2 min-w-[8rem]">Scan payload</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-b border-gray-100 align-top hover:bg-blue-50/30">
                    <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                      <time dateTime={ev.timestamp} title={ev.timestamp}>
                        {formatDateTimeShort(ev.timestamp)}
                      </time>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                      {labelTitleCase(ev.event_type)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-800">
                      {summarizeStateTransition(ev)}
                    </td>
                    <td className="max-w-[18rem] px-4 py-2 text-gray-800">
                      <span className="text-gray-500 whitespace-nowrap">From:</span>{" "}
                      <span className="break-words">{compactLocation(ev.from_location)}</span>
                      <span className="mx-2 text-gray-300">/</span>
                      <span className="text-gray-500 whitespace-nowrap">To:</span>{" "}
                      <span className="break-words">{compactLocation(ev.to_location)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-800">{ev.user_id}</td>
                    <td className="px-4 py-2">
                      <code
                        className="break-all text-xs text-gray-800 font-mono"
                        title={ev.scan_payload || undefined}
                      >
                        {ev.scan_payload.trim() === "" ? "—" : ev.scan_payload}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
    >
      ← All assets
    </Link>
  );
}

function DetailPair({
  label,
  value,
  muted,
}: {
  label: string;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="text-gray-500 text-xs font-medium uppercase tracking-wide">{label}</dt>
      <dd className={`mt-1 ${muted ? "text-gray-700" : "text-gray-900"} break-words`}>{value}</dd>
    </div>
  );
}
