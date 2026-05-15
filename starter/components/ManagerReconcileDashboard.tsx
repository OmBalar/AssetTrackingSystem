"use client";

import { formatDateTimeShort, labelTitleCase } from "@/lib/format-display";
import type {
  Confidence,
  IssueSeverity,
  ReconciliationApiResponse,
  ReconciliationCategory,
  ReconciliationItem,
} from "@/lib/reconciliation";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const CATEGORY_ORDER: ReconciliationCategory[] = [
  "needs_review",
  "drift",
  "expected_difference",
  "healthy",
];

const SECTION_COPY: Record<
  Exclude<ReconciliationCategory, "healthy">,
  { title: string; blurb: string; whyItMatters: string }
> = {
  needs_review: {
    title: "Needs a clear decision",
    blurb: "Books and floor disagree, or only one system knows about this tag. Assign an owner—usually you plus finance or facilities.",
    whyItMatters:
      "These rows touch capital, custody, or physical space: get them wrong and audits, insurance, or a tech wasting a trip to the wrong rack become real risks.",
  },
  drift: {
    title: "Out of sync—but usually straightforward",
    blurb: "One system missed an update after the last scan or walk. Most rows clear with a single correction.",
    whyItMatters:
      "Dispatch, capacity planning, and customer-facing downtime all assume CMMS and the floor log match. Drift is how teams show up with the wrong part or open a ticket nobody can close.",
  },
  expected_difference: {
    title: "Within normal operating range",
    blurb: "Typical hand-offs between receiving, capital projects, and procurement. Skim before you pull someone off the floor.",
    whyItMatters:
      "Receiving and accounting rarely move at the same hour—knowing what's normal here keeps you from pulling techs off the line for paperwork that is still in flight.",
  },
};

/** All-clear bucket: operational significance for the healthy list. */
const ALL_CLEAR_WHY_IT_MATTERS =
  "Green rows mean finance, facilities, and the floor are telling the same custody story—fewer surprises at quarter close, rent review, or the next safety walk.";

const SEVERITY_ORDER: Record<IssueSeverity | "none", number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4,
  none: 5,
};

/** Calm urgency for triage—not developer severity names. */
function rowUrgencyLabel(sev: IssueSeverity | "none"): string {
  if (sev === "none") return "—";
  switch (sev) {
    case "critical":
      return "Today";
    case "high":
      return "Soon";
    case "medium":
      return "This week";
    case "low":
      return "When able";
    case "informational":
      return "FYI";
    default:
      return sev;
  }
}

/** Shorter line for per-issue follow-up in expanded list. */
function followUpPhrase(sev: IssueSeverity): string {
  switch (sev) {
    case "critical":
      return "Same-day follow-up";
    case "high":
      return "Address soon";
    case "medium":
      return "Plan follow-up this week";
    case "low":
      return "Light touch";
    case "informational":
      return "Awareness only";
    default:
      return sev;
  }
}

function severityStyles(sev: IssueSeverity | "none"): string {
  if (sev === "none") return "bg-gray-50 text-gray-600 border-gray-200";
  if (sev === "critical" || sev === "high") {
    return "bg-rose-50 text-rose-900 border-rose-200";
  }
  if (sev === "medium") return "bg-amber-50 text-amber-950 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function sortWithinCategory(a: ReconciliationItem, b: ReconciliationItem): number {
  if (SEVERITY_ORDER[a.row_severity] !== SEVERITY_ORDER[b.row_severity]) {
    return SEVERITY_ORDER[a.row_severity] - SEVERITY_ORDER[b.row_severity];
  }
  return a.asset_tag.localeCompare(b.asset_tag);
}

function formatConfidence(c: Confidence): string {
  if (c === "high") return "Strong signal—unlikely to be noise alone.";
  if (c === "medium") return "Could be timing or naming—quick verify helps.";
  return "Often a label or close-out lag—confirm before you escalate.";
}

function orphanSubhint(facilityOnly: number, financeOnly: number): string | undefined {
  const parts: string[] = [];
  if (facilityOnly > 0) {
    parts.push(
      `${facilityOnly} tag${facilityOnly === 1 ? "" : "s"} only in facilities (no floor record)`,
    );
  }
  if (financeOnly > 0) {
    parts.push(
      `${financeOnly} tag${financeOnly === 1 ? "" : "s"} only in finance (no floor record)`,
    );
  }
  if (parts.length === 0) return undefined;
  return parts.join("; ") + ".";
}

function SummaryCard({
  label,
  count,
  hint,
  emphasize,
}: {
  label: string;
  count: number;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border p-4",
        emphasize && count > 0 ? "border-rose-300 bg-rose-50/80" : "border-gray-200 bg-white",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{count}</p>
      {hint ? <p className="mt-2 text-xs text-gray-600">{hint}</p> : null}
    </div>
  );
}

function IssueRow({
  item,
  expanded,
  onToggle,
}: {
  item: ReconciliationItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const firstLine = item.explanation.split(/\n\n/)[0] ?? item.explanation;
  const hasDetail =
    item.suggested_actions.length > 0 ||
    item.issues.length > 1 ||
    item.explanation.includes("\n\n") ||
    item.context.facilities_freshness;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start gap-3 p-3">
        <div
          className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${severityStyles(item.row_severity)}`}
        >
          {item.row_severity === "none" ? "—" : rowUrgencyLabel(item.row_severity)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {item.presence.operations ? (
              <Link
                href={`/manager/assets/${encodeURIComponent(item.asset_tag)}`}
                className="font-mono text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
              >
                {item.asset_tag}
              </Link>
            ) : (
              <span className="font-mono text-sm font-semibold text-gray-900">{item.asset_tag}</span>
            )}
            <span className="text-gray-400">·</span>
            <span className="text-sm font-medium text-gray-900">{item.headline}</span>
          </div>
          <p className="mt-1 text-sm leading-snug text-gray-600">{firstLine}</p>
          {item.row_confidence !== "high" ? (
            <p className="mt-1 text-xs text-gray-500">{formatConfidence(item.row_confidence)}</p>
          ) : null}
        </div>
        {hasDetail ? (
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            aria-expanded={expanded}
          >
            {expanded ? "Hide specifics" : "More detail"}
          </button>
        ) : null}
      </div>
      {expanded && hasDetail ? (
        <div className="space-y-3 border-t border-gray-100 bg-gray-50/80 px-3 py-3 text-sm text-gray-700">
          {item.explanation.includes("\n\n") ? (
            <div className="space-y-2 whitespace-pre-wrap">{item.explanation}</div>
          ) : null}
          {item.suggested_actions.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                What to do next
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-gray-700">
                {item.suggested_actions.map((a) => (
                  <li key={a} className="leading-snug">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <dl className="grid gap-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">Floor record</dt>
              <dd className="font-medium text-gray-900">
                {item.context.ops_state ? labelTitleCase(item.context.ops_state) : "—"}
                {item.context.ops_location_summary ? (
                  <span className="mt-0.5 block font-normal text-gray-600">
                    {item.context.ops_location_summary}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Rack slot (facilities)</dt>
              <dd className="font-medium text-gray-900">{item.context.facilities_rack ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Books (finance)</dt>
              <dd className="font-medium text-gray-900">
                {item.context.finance_status ? labelTitleCase(item.context.finance_status) : "—"}
                {item.context.finance_id ? (
                  <span className="block font-normal text-gray-600">{item.context.finance_id}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Systems holding this tag</dt>
              <dd className="text-gray-900">
                {[
                  item.presence.operations ? "Floor" : null,
                  item.presence.facilities ? "Facilities" : null,
                  item.presence.finance ? "Finance" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </dd>
            </div>
          </dl>
          {item.context.facilities_freshness ? (
            <div className="rounded border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700">
              <span className="font-semibold text-gray-900">Facilities timing vs. floor updates · </span>
              {item.context.facilities_freshness.summary}
            </div>
          ) : null}
          {item.issues.length > 1 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Everything we saw on this tag
              </p>
              <ul className="mt-1 space-y-1">
                {item.issues.map((iss) => (
                  <li key={iss.code} className="text-xs text-gray-700">
                    <span className="font-medium text-gray-900">{iss.summary}</span>
                    <span className="text-gray-500"> · {followUpPhrase(iss.severity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CategorySection({
  category,
  items,
  expandedIds,
  toggle,
}: {
  category: Exclude<ReconciliationCategory, "healthy">;
  items: ReconciliationItem[];
  expandedIds: Set<string>;
  toggle: (tag: string) => void;
}) {
  if (items.length === 0) return null;
  const copy = SECTION_COPY[category];
  const sorted = [...items].sort(sortWithinCategory);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{copy.title}</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-600">{copy.blurb}</p>
          <p className="mt-2 max-w-2xl border-l-2 border-gray-200 pl-3 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">Why this matters · </span>
            {copy.whyItMatters}
          </p>
        </div>
        <span className="tabular-nums text-sm font-medium text-gray-500">{sorted.length}</span>
      </div>
      <div className="space-y-2">
        {sorted.map((item) => (
          <IssueRow
            key={item.asset_tag}
            item={item}
            expanded={expandedIds.has(item.asset_tag)}
            onToggle={() => toggle(item.asset_tag)}
          />
        ))}
      </div>
    </section>
  );
}

export function ManagerReconcileDashboard() {
  const [data, setData] = useState<ReconciliationApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((tag: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/reconcile", { cache: "no-store" })
      .then(async (res) => {
        const json: unknown = await res.json();
        if (!res.ok) {
          const msg =
            typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof (json as { error?: { message?: string } }).error?.message === "string"
              ? (json as { error: { message: string } }).error.message
              : `We could not read the report (HTTP ${res.status}).`;
          throw new Error(msg);
        }
        return json as ReconciliationApiResponse;
      })
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "The reconciliation snapshot did not load.");
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<ReconciliationCategory, ReconciliationItem[]>();
    for (const c of CATEGORY_ORDER) map.set(c, []);
    if (!data) return map;
    for (const item of data.items) {
      map.get(item.category)?.push(item);
    }
    return map;
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <p className="text-sm font-medium text-gray-900">Pulling the latest snapshot…</p>
        <p className="text-sm text-gray-600">
          Connecting to floor records, facilities rack view, and finance equipment lines.
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-medium">This report is not available right now</p>
        <p className="mt-1 text-amber-900/95">{error ?? "Something went wrong while loading."}</p>
        <p className="mt-2 text-xs text-amber-900/90">
          Most often this is a missing server token or the upstream API not running. Set{" "}
          <code className="rounded bg-amber-100/80 px-1">API_TOKEN</code> in{" "}
          <code className="rounded bg-amber-100/80 px-1">starter/.env</code>, restart Next.js, and confirm the
          asset API is up.
        </p>
      </div>
    );
  }

  const { summary } = data;
  const healthyItems = byCategory.get("healthy") ?? [];
  const attentionCount = summary.total_tags - summary.healthy;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Clear decisions needed"
          count={summary.needs_review}
          hint={orphanSubhint(summary.orphan_facilities, summary.orphan_finance)}
          emphasize={summary.needs_review > 0}
        />
        <SummaryCard label="Straightforward fixes" count={summary.drift} />
        <SummaryCard label="Normal hand-offs" count={summary.expected_difference} />
        <SummaryCard label="All clear" count={summary.healthy} />
      </div>

      <p className="text-xs text-gray-500">
        Snapshot {formatDateTimeShort(data.generated_at)} · {summary.total_tags} tags joined across floor,
        facilities, and finance ·{" "}
        <span className="font-medium text-gray-700">
          {attentionCount} with a note (includes normal procurement timing)
        </span>
      </p>

      {attentionCount === 0 ? (
        <p className="text-sm text-gray-800">
          Clean run—every joined tag lines up with the rules we expect for rack view, floor state, and books.
        </p>
      ) : null}

      <div className="space-y-10">
        <CategorySection
          category="needs_review"
          items={byCategory.get("needs_review") ?? []}
          expandedIds={expandedIds}
          toggle={toggle}
        />
        <CategorySection
          category="drift"
          items={byCategory.get("drift") ?? []}
          expandedIds={expandedIds}
          toggle={toggle}
        />
        <CategorySection
          category="expected_difference"
          items={byCategory.get("expected_difference") ?? []}
          expandedIds={expandedIds}
          toggle={toggle}
        />
      </div>

      <details className="rounded-lg border border-gray-200 bg-gray-50/50">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-800 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>
              All clear{" "}
              <span className="tabular-nums font-normal text-gray-600">({healthyItems.length})</span>
            </span>
            <span className="text-xs font-normal text-gray-500">
              Optional—open only if you need a tag list
            </span>
          </span>
        </summary>
        <div className="border-t border-gray-200 px-4 py-3">
          <p className="mb-3 max-w-2xl border-l-2 border-gray-200 pl-3 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">Why this matters · </span>
            {ALL_CLEAR_WHY_IT_MATTERS}
          </p>
          {healthyItems.length === 0 ? (
            <p className="text-sm text-gray-600">
              No tags landed in the all-clear bucket for this snapshot—if that surprises you, try again after
              the next sync from the floor or CMMS.
            </p>
          ) : (
            <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
              {healthyItems.map((item) => (
                <Link
                  key={item.asset_tag}
                  href={`/manager/assets/${encodeURIComponent(item.asset_tag)}`}
                  className="rounded border border-gray-200 bg-white px-2 py-0.5 font-mono text-xs text-blue-700 hover:bg-gray-50"
                >
                  {item.asset_tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
