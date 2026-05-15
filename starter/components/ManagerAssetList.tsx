"use client";

import { api, ApiError } from "@/lib/api-client";
import { formatApiErrorForUser } from "@/lib/format-api-error";
import type { Asset, AssetState } from "@/lib/types";
import { formatDateTimeShort, labelTitleCase } from "@/lib/format-display";
import {
  MANAGER_LIST_PAGE_SIZE_OPTIONS,
  parseManagerListPageSize,
} from "@/lib/manager-list-params";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReconciliationApiResponse, ReconciliationCategory } from "@/lib/reconciliation";

const PAGE_SIZE_OPTIONS = MANAGER_LIST_PAGE_SIZE_OPTIONS;

/** Tooltip copy for flagged rows (matches dashboard buckets). */
const RECONCILE_VISIT_HINT =
  "Open Three-way reconciliation for the full report and suggested next steps.";

const RECON_CATEGORY_HOVER: Record<
  Exclude<ReconciliationCategory, "healthy">,
  string
> = {
  needs_review: `Category: needs a clear decision. ${RECONCILE_VISIT_HINT}`,
  drift: `Category: out of sync (usually fixable). ${RECONCILE_VISIT_HINT}`,
  expected_difference: `Category: within normal operating range (still listed on the report). ${RECONCILE_VISIT_HINT}`,
};

function reconciliationTooltip(category: ReconciliationCategory): string | null {
  if (category === "healthy") return null;
  return RECON_CATEGORY_HOVER[category];
}

function ReconciliationRowAlert({ tooltip }: { tooltip: string }) {
  const tipId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: r.left + r.width / 2,
      top: r.top,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updatePosition]);

  const onOpen = () => {
    updatePosition();
    setOpen(true);
  };
  const onClose = () => setOpen(false);

  return (
    <>
      <span
        ref={anchorRef}
        className="relative inline-flex shrink-0 cursor-help text-amber-600 outline-none"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={onOpen}
        onMouseLeave={onClose}
        onFocus={onOpen}
        onBlur={onClose}
        tabIndex={0}
        aria-describedby={open ? tipId : undefined}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      </span>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className="pointer-events-none fixed z-[300] w-max max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs font-medium leading-snug text-gray-900 shadow-md"
              style={{
                left: pos.left,
                top: pos.top,
                transform: "translate(-50%, calc(-100% - 8px))",
              }}
            >
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Three-way reconciliation
              </span>
              <span className="mt-1 block font-normal text-gray-800">{tooltip}</span>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

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
  const searchParams = useSearchParams();

  const stateFilter = searchParams.get("state") ?? "";
  const siteFilter = searchParams.get("site") ?? "";
  const custodianFilter = searchParams.get("custodian") ?? "";
  const pageSize = parseManagerListPageSize(searchParams.get("ps"));
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  /** Tags flagged on the three-way report (non-healthy only). Null = not loaded yet. */
  const [reconcileByTag, setReconcileByTag] = useState<Map<
    string,
    ReconciliationCategory
  > | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reconcile", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<ReconciliationApiResponse>;
      })
      .then((data) => {
        if (cancelled || !data) {
          if (!cancelled) setReconcileByTag(new Map());
          return;
        }
        const m = new Map<string, ReconciliationCategory>();
        for (const item of data.items) {
          if (item.category !== "healthy") {
            m.set(item.asset_tag, item.category);
          }
        }
        if (!cancelled) setReconcileByTag(m);
      })
      .catch(() => {
        if (!cancelled) setReconcileByTag(new Map());
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

  const filteredRows = useMemo(() => {
    return allAssets
      .filter(
        (a) =>
          (!stateFilter || a.state === stateFilter) &&
          (!siteFilter || a.location.site === siteFilter) &&
          (!custodianFilter || a.custodian === custodianFilter),
      )
      .sort((a, b) => {
        const tb = Date.parse(b.updated_at);
        const ta = Date.parse(a.updated_at);
        const diff = (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
        if (diff !== 0) return diff;
        return a.asset_tag.localeCompare(b.asset_tag);
      });
  }, [allAssets, stateFilter, siteFilter, custodianFilter]);

  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages && totalPages >= 1) {
      const next = new URLSearchParams(searchParams.toString());
      if (totalPages <= 1) next.delete("page");
      else next.set("page", String(totalPages));
      const qs = next.toString();
      router.replace(qs ? `/manager?${qs}` : `/manager`, { scroll: false });
    }
  }, [page, totalPages, router, searchParams]);

  const pageSlice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, page, pageSize]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const listQs = searchParams.toString();

  const patchListParams = useCallback(
    (patch: {
      state?: string;
      site?: string;
      custodian?: string;
      page?: number;
      ps?: number;
    }) => {
      const next = new URLSearchParams(searchParams.toString());
      const apply = (key: string, val: string | undefined) => {
        if (val == null || val === "") next.delete(key);
        else next.set(key, val);
      };
      if (patch.state !== undefined) apply("state", patch.state);
      if (patch.site !== undefined) apply("site", patch.site);
      if (patch.custodian !== undefined) apply("custodian", patch.custodian);
      if (patch.ps !== undefined) {
        next.set("ps", String(patch.ps));
        next.delete("page");
      }
      if (patch.page !== undefined) {
        if (patch.page <= 1) next.delete("page");
        else next.set("page", String(patch.page));
      }
      const qs = next.toString();
      router.replace(qs ? `/manager?${qs}` : `/manager`, { scroll: false });
    },
    [router, searchParams],
  );

  const gotoDetail = useCallback(
    (tag: string) => {
      const suffix = listQs ? `?back=${encodeURIComponent(listQs)}` : "";
      router.push(`/manager/assets/${encodeURIComponent(tag)}${suffix}`);
    },
    [router, listQs],
  );

  const detailHref = useCallback(
    (tag: string) =>
      `/manager/assets/${encodeURIComponent(tag)}${
        listQs ? `?back=${encodeURIComponent(listQs)}` : ""
      }`,
    [listQs],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm min-w-[8.5rem]">
          <span className="text-gray-600">State</span>
          <select
            value={stateFilter}
            onChange={(e) => patchListParams({ state: e.target.value, page: 1 })}
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
            onChange={(e) => patchListParams({ site: e.target.value, page: 1 })}
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
            onChange={(e) => patchListParams({ custodian: e.target.value, page: 1 })}
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
                  const rowDetailHref = detailHref(asset.asset_tag);
                  const reconCategory = reconcileByTag?.get(asset.asset_tag);
                  const reconTooltip =
                    reconCategory ? reconciliationTooltip(reconCategory) : null;
                  return (
                    <tr
                      key={asset.asset_tag}
                      className="border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors"
                      onClick={() => gotoDetail(asset.asset_tag)}
                    >
                      <td className="px-4 py-2 font-medium text-gray-900 tabular-nums">
                        <span className="inline-flex items-center gap-1.5">
                          {asset.asset_tag}
                          {reconTooltip ? (
                            <ReconciliationRowAlert tooltip={reconTooltip} />
                          ) : null}
                        </span>
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
                          href={rowDetailHref}
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
                    onClick={() => patchListParams({ ps: n, page: 1 })}
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
                  onClick={() => patchListParams({ page: page - 1 })}
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
                  onClick={() => patchListParams({ page: page + 1 })}
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
