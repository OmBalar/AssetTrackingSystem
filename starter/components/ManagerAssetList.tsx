"use client";

import { api, ApiError } from "@/lib/api-client";
import { formatApiErrorForUser } from "@/lib/format-api-error";
import type { Asset, AssetState } from "@/lib/types";
import { formatDateTimeShort, labelTitleCase } from "@/lib/format-display";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const ASSET_STATES: AssetState[] = [
  "unreceived",
  "received",
  "stored",
  "in_service",
  "rma_pending",
  "disposed",
];

export function ManagerAssetList() {
  const router = useRouter();
  const [stateFilter, setStateFilter] = useState<string>("");
  const [siteFilter, setSiteFilter] = useState<string>("");
  const [custodianFilter, setCustodianFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    api.assets
      .list({})
      .then((assets) => {
        if (!cancelled) {
          setAllAssets(assets);
          setListLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg =
            err instanceof ApiError ? formatApiErrorForUser(err) : "Couldn't load assets.";
          setListError(msg);
          setAllAssets([]);
          setListLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sites = useMemo(
    () =>
      [...new Set(allAssets.map((a) => a.location.site))].sort((a, b) => a.localeCompare(b)),
    [allAssets],
  );

  const custodians = useMemo(
    () => [...new Set(allAssets.map((a) => a.custodian))].sort((a, b) => a.localeCompare(b)),
    [allAssets],
  );

  const filteredRows = useMemo(
    () =>
      allAssets.filter(
        (a) =>
          (!stateFilter || a.state === stateFilter) &&
          (!siteFilter || a.location.site === siteFilter) &&
          (!custodianFilter || a.custodian === custodianFilter),
      ),
    [allAssets, stateFilter, siteFilter, custodianFilter],
  );

  useEffect(() => {
    setPage(1);
  }, [stateFilter, siteFilter, custodianFilter]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageSlice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const gotoDetail = useCallback(
    (tag: string) => {
      router.push(`/manager/assets/${encodeURIComponent(tag)}`);
    },
    [router],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm min-w-[8.5rem]">
          <span className="text-gray-600">State</span>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Filter by asset state"
          >
            <option value="">All states</option>
            {ASSET_STATES.map((s) => (
              <option key={s} value={s}>
                {labelTitleCase(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm flex-1 min-w-[10rem] max-w-[16rem]">
          <span className="text-gray-600">Site</span>
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Filter by site"
          >
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm flex-1 min-w-[10rem] max-w-[16rem]">
          <span className="text-gray-600">Custodian</span>
          <select
            value={custodianFilter}
            onChange={(e) => setCustodianFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Filter by custodian"
          >
            <option value="">All custodians</option>
            {custodians.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {listError ? (
        <div className="px-4 py-6 text-center text-red-700 text-sm">{listError}</div>
      ) : null}

      {listLoading ? (
        <div className="px-4 py-12 text-center text-gray-500 text-sm" aria-busy="true">
          Loading assets…
        </div>
      ) : !listError && total === 0 ? (
        <div className="px-4 py-12 text-center text-gray-600 text-sm">
          No assets match these filters.
        </div>
      ) : !listError ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-gray-700">
                  <th className="px-4 py-2 font-semibold">Tag</th>
                  <th className="px-4 py-2 font-semibold">State</th>
                  <th className="px-4 py-2 font-semibold">Site</th>
                  <th className="px-4 py-2 font-semibold">Custodian</th>
                  <th className="px-4 py-2 font-semibold">Model</th>
                  <th className="px-4 py-2 font-semibold">Updated</th>
                  <th className="px-4 py-2 font-semibold w-[1%] whitespace-nowrap"> </th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((asset) => {
                  const detailHref = `/manager/assets/${encodeURIComponent(asset.asset_tag)}`;
                  return (
                    <tr
                      key={asset.asset_tag}
                      className="border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
                      onClick={() => gotoDetail(asset.asset_tag)}
                    >
                      <td className="px-4 py-2 font-medium text-gray-900 tabular-nums">
                        {asset.asset_tag}
                      </td>
                      <td className="px-4 py-2 text-gray-800">
                        {labelTitleCase(asset.state)}
                      </td>
                      <td className="px-4 py-2 text-gray-800">{asset.location.site}</td>
                      <td className="px-4 py-2 text-gray-800">{asset.custodian}</td>
                      <td className="px-4 py-2 text-gray-700 max-w-[12rem] truncate" title={asset.model}>
                        {asset.model}
                      </td>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                        {formatDateTimeShort(asset.updated_at)}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        <Link
                          href={detailHref}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="inline-flex rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-800 shadow-sm hover:bg-gray-50 hover:border-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                          aria-label={`More details for ${asset.asset_tag}`}
                        >
                          Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50/80 px-4 py-3 text-sm">
            <p className="text-gray-600">
              Showing{" "}
              <span className="font-medium text-gray-900">
                {from}–{to}
              </span>{" "}
              of{" "}
              <span className="font-medium text-gray-900">{total}</span>
            </p>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Rows per page"
              >
                <span className="text-gray-600 mr-0.5">View</span>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={pageSize === n}
                    onClick={() => setPageSize(n)}
                    className={`rounded-lg border px-2.5 py-1 font-medium shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                      pageSize === n
                        ? "border-blue-600 bg-blue-50 text-blue-950"
                        : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-gray-600 whitespace-nowrap">rows per page</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-gray-700 px-2" aria-live="polite">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
