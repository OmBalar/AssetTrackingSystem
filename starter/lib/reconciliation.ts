import type { Asset, AssetState, FacilitiesRecord, FinanceRecord } from "./types.js";

/** Categories: worst issue tier on a row wins (needs_review > drift > expected_difference > healthy). */
export type ReconciliationCategory =
  | "healthy"
  | "expected_difference"
  | "drift"
  | "needs_review";

/** Impact / urgency for triage (within a category). */
export type IssueSeverity = "critical" | "high" | "medium" | "low" | "informational";

/** How sure we are that this issue reflects a real problem vs naming or timing noise. */
export type Confidence = "high" | "medium" | "low";

export type FacilitiesFreshness = {
  facilities_last_observed: string;
  operations_updated_at: string;
  /** Short manager-readable comparison */
  summary: string;
  /** Facilities walk is noticeably older than last ops change */
  facilities_likely_stale_vs_ops: boolean;
  /** Facilities timestamp is newer than ops — unusual; verify which system caught the latest move */
  facilities_newer_than_ops: boolean;
};

export type ReconciliationIssue = {
  code: string;
  tier: "expected_difference" | "drift" | "needs_review";
  severity: IssueSeverity;
  confidence: Confidence;
  summary: string;
  detail: string;
  suggested_actions: string[];
};

export type ReconciliationItem = {
  asset_tag: string;
  category: ReconciliationCategory;
  /** Worst severity on the row; healthy rows use "none". */
  row_severity: IssueSeverity | "none";
  /** Weakest link across issues: how much to trust the worst flag. */
  row_confidence: Confidence;
  /** Lower sorts first: needs_review → drift → expected_difference → healthy */
  sort_key: number;
  headline: string;
  explanation: string;
  suggested_actions: string[];
  presence: {
    operations: boolean;
    facilities: boolean;
    finance: boolean;
  };
  context: {
    ops_state: AssetState | null;
    ops_location_summary: string | null;
    ops_rack_normalized: string | null;
    ops_updated_at: string | null;
    facilities_rack: string | null;
    facilities_space_id: string | null;
    facilities_last_observed: string | null;
    facilities_freshness: FacilitiesFreshness | null;
    finance_id: string | null;
    finance_status: FinanceRecord["status"] | null;
    finance_site: string | null;
  };
  issues: ReconciliationIssue[];
};

export type ReconciliationReport = {
  generated_at: string;
  summary: {
    healthy: number;
    expected_difference: number;
    drift: number;
    needs_review: number;
    total_tags: number;
    orphan_facilities: number;
    orphan_finance: number;
  };
  items: ReconciliationItem[];
};

/** Body returned by GET /api/reconcile (report plus routing metadata). */
export type ReconciliationApiResponse = ReconciliationReport & {
  meta: {
    schema: string;
    sources: Record<string, string>;
  };
};

const CATEGORY_RANK: Record<ReconciliationCategory, number> = {
  needs_review: 0,
  drift: 1,
  expected_difference: 2,
  healthy: 3,
};

const TIER_TO_CATEGORY: Record<ReconciliationIssue["tier"], ReconciliationCategory> = {
  needs_review: "needs_review",
  drift: "drift",
  expected_difference: "expected_difference",
};

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4,
};

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** If facilities `last_observed` is this many days older than ops `updated_at`, rack/facility disagreements are often just CMMS lag. */
const FACILITIES_STALE_VS_OPS_DAYS = 3;

const MS_PER_DAY = 86_400_000;

function tierRank(tier: ReconciliationIssue["tier"]): number {
  return CATEGORY_RANK[TIER_TO_CATEGORY[tier]];
}

function maxTier(a: ReconciliationIssue["tier"], b: ReconciliationIssue["tier"]): ReconciliationIssue["tier"] {
  return tierRank(a) <= tierRank(b) ? a : b;
}

function worstSeverity(a: IssueSeverity, b: IssueSeverity): IssueSeverity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

function worstConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

function dedupeActions(actions: string[]): string[] {
  return [...new Set(actions.map((s) => s.trim()).filter(Boolean))];
}

function parseIsoMs(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function formatManagerDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * Compare facilities walk timestamp to operations' last change.
 * Used to soften false positives when CMMS is simply behind floor scans.
 */
export function computeFacilitiesFreshness(
  lastObserved: string | null,
  opsUpdatedAt: string | null,
): FacilitiesFreshness | null {
  if (!lastObserved || !opsUpdatedAt) return null;
  const facMs = parseIsoMs(lastObserved);
  const opsMs = parseIsoMs(opsUpdatedAt);
  if (facMs === null || opsMs === null) return null;

  const diffDays = (opsMs - facMs) / MS_PER_DAY;
  const facilitiesLikelyStale = diffDays > FACILITIES_STALE_VS_OPS_DAYS;
  const facilitiesNewer = facMs > opsMs + MS_PER_DAY;

  let summary: string;
  if (facilitiesLikelyStale) {
    summary = `Last facilities walk (${formatManagerDate(lastObserved)}) is older than the last operations change (${formatManagerDate(opsUpdatedAt)}). If the asset moved recently, CMMS may just be behind—queue a refresh before reassigning blame.`;
  } else if (facilitiesNewer) {
    summary = `Facilities shows a newer walk date (${formatManagerDate(lastObserved)}) than operations' last update (${formatManagerDate(opsUpdatedAt)}). Decide which system saw the latest physical move.`;
  } else {
    summary = `Facilities walk and operations timestamps are in the same window (${formatManagerDate(lastObserved)} vs ${formatManagerDate(opsUpdatedAt)}).`;
  }

  return {
    facilities_last_observed: lastObserved,
    operations_updated_at: opsUpdatedAt,
    summary,
    facilities_likely_stale_vs_ops: facilitiesLikelyStale,
    facilities_newer_than_ops: facilitiesNewer,
  };
}

/** Join path segments the same way procedural seed builds `rack_location`. */
export function rackLocationFromOpsLocation(asset: Asset): string | null {
  if (asset.state !== "in_service") return null;
  const parts = [
    asset.location.site,
    asset.location.room,
    asset.location.row,
    asset.location.rack,
    asset.location.ru,
  ].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.length ? parts.join("/") : null;
}

function summarizeOpsLocation(asset: Asset): string {
  const { site, room, row, rack, ru } = asset.location;
  const parts = [site, room, row, rack, ru].filter((p): p is string => Boolean(p && p.length > 0));
  return parts.join(" · ");
}

/** Facilities mock should only list racked production instruments — not storage, receiving, RMA, disposal. */
export function facilitiesRowExpectedForOpsState(state: AssetState): boolean {
  return state === "in_service";
}

/** Plain wording for managers (reconciliation copy). */
function opsStateForManagers(state: AssetState): string {
  switch (state) {
    case "unreceived":
      return "not yet received in operations";
    case "received":
      return "received—still in dock / receiving (not on a production rack)";
    case "stored":
      return "stored off the production rack";
    case "in_service":
      return "in service on the floor";
    case "rma_pending":
      return "out for RMA—not expected on a production rack";
    case "disposed":
      return "disposed";
    default:
      return state;
  }
}

function financeStatusConflictsWithDisposed(status: FinanceRecord["status"]): boolean {
  return status === "capitalized" || status === "pending_receipt";
}

function financeImpliesRetired(status: FinanceRecord["status"]): boolean {
  return status === "retired";
}

export function collectAssetTags(
  assets: Asset[],
  facilities: FacilitiesRecord[],
  finance: FinanceRecord[],
): string[] {
  const tags = new Set<string>();
  for (const a of assets) tags.add(a.asset_tag);
  for (const f of facilities) tags.add(f.tagged_id);
  for (const g of finance) tags.add(g.tag);
  return [...tags].sort();
}

export function groupFacilitiesByTag(records: FacilitiesRecord[]): Map<string, FacilitiesRecord[]> {
  const m = new Map<string, FacilitiesRecord[]>();
  for (const r of records) {
    const list = m.get(r.tagged_id) ?? [];
    list.push(r);
    m.set(r.tagged_id, list);
  }
  return m;
}

export function groupFinanceByTag(records: FinanceRecord[]): Map<string, FinanceRecord[]> {
  const m = new Map<string, FinanceRecord[]>();
  for (const r of records) {
    const list = m.get(r.tag) ?? [];
    list.push(r);
    m.set(r.tag, list);
  }
  return m;
}

function aggregateRowSeverity(issues: ReconciliationIssue[]): IssueSeverity | "none" {
  if (issues.length === 0) return "none";
  return issues.reduce((acc, i) => worstSeverity(acc, i.severity), issues[0]!.severity);
}

function aggregateRowConfidence(issues: ReconciliationIssue[]): Confidence {
  if (issues.length === 0) return "high";
  return issues.reduce((acc, i) => worstConfidence(acc, i.confidence), issues[0]!.confidence);
}

/** Build issues for one joined row; pure logic for tests. */
export function reconcileJoinedRow(
  asset_tag: string,
  asset: Asset | null,
  facilityRows: FacilitiesRecord[],
  financeRows: FinanceRecord[],
): Omit<
  ReconciliationItem,
  | "category"
  | "sort_key"
  | "headline"
  | "explanation"
  | "suggested_actions"
  | "row_severity"
  | "row_confidence"
> & { issues: ReconciliationIssue[] } {
  const financeRow = financeRows[0] ?? null;
  const primaryFac = facilityRows[0] ?? null;
  const freshness =
    asset && primaryFac ? computeFacilitiesFreshness(primaryFac.last_observed, asset.updated_at) : null;

  const presence = {
    operations: Boolean(asset),
    facilities: facilityRows.length > 0,
    finance: financeRows.length > 0,
  };

  const context = {
    ops_state: asset?.state ?? null,
    ops_location_summary: asset ? summarizeOpsLocation(asset) : null,
    ops_rack_normalized: asset ? rackLocationFromOpsLocation(asset) : null,
    ops_updated_at: asset?.updated_at ?? null,
    facilities_rack: primaryFac?.rack_location ?? null,
    facilities_space_id: primaryFac?.space_id ?? null,
    facilities_last_observed: primaryFac?.last_observed ?? null,
    facilities_freshness: freshness,
    finance_id: financeRow?.finance_id ?? null,
    finance_status: financeRow?.status ?? null,
    finance_site: financeRow?.site ?? null,
  };

  const issues: ReconciliationIssue[] = [];

  if (facilityRows.length > 1) {
    issues.push({
      code: "duplicate_facility_rows",
      tier: "needs_review",
      severity: "high",
      confidence: "high",
      summary: "Two rack assignments in facilities for the same tag",
      detail:
        "Facilities lists this tag on two different rack rows. Until the duplicate is removed, you cannot tell which slot is real.",
      suggested_actions: ["Confirm which row matches the floor label, then delete or correct the extra facilities entry."],
    });
  }

  if (financeRows.length > 1) {
    issues.push({
      code: "duplicate_finance_rows",
      tier: "needs_review",
      severity: "high",
      confidence: "high",
      summary: "Two finance records share this asset tag",
      detail:
        "Finance shows two equipment lines for one tag. Book value and depreciation should ride on a single asset record.",
      suggested_actions: ["Ask finance to merge the duplicate lines or correct a mis-tagged PO."],
    });
  }

  // --- Orphans: mock data with no operations asset ---
  if (!asset) {
    if (primaryFac) {
      const facDate = formatManagerDate(primaryFac.last_observed);
      issues.push({
        code: "orphan_facility_record",
        tier: "needs_review",
        severity: "high",
        confidence: "high",
        summary: "Facilities shows this tag; operations has no matching asset",
        detail: `Facilities still lists this tag (last facilities walk ${facDate}). Operations has no record—often a typo on the label, a CMMS row that was never cleared, or a unit that never completed receive.`,
        suggested_actions: [
          "Verify the barcode on the hardware; fix the facilities row or create the missing operations record.",
        ],
      });
    }
    if (financeRow) {
      if (financeRow.status === "pending_receipt") {
        issues.push({
          code: "orphan_finance_pending_receipt",
          tier: "expected_difference",
          severity: "informational",
          confidence: "low",
          summary: "Expected: PO line in finance before the dock receives it",
          detail:
            "Finance shows pending receipt and operations has no asset yet. Procurement usually opens the line before receiving posts.",
          suggested_actions: [
            "No floor action if the PO is on track—after receive, operations should pick up this tag automatically.",
          ],
        });
      } else {
        issues.push({
          code: "orphan_finance_record",
          tier: "needs_review",
          severity: "medium",
          confidence: "medium",
          summary: "Finance lists this tag; operations has no matching asset",
          detail:
            "There is a book record for this tag but nothing on the floor system. After capitalization that is unusual—worth a quick ID check with finance and receiving.",
          suggested_actions: [
            "Confirm the tag with finance; schedule receive in operations or retire the stub if the unit never shipped.",
          ],
        });
      }
    }
    return { asset_tag, presence, context, issues };
  }

  // --- From here we always have `asset` ---

  if (primaryFac && !facilitiesRowExpectedForOpsState(asset.state)) {
    const staleNote = freshness?.facilities_likely_stale_vs_ops ? ` ${freshness.summary}` : "";
    const sev: IssueSeverity = freshness?.facilities_likely_stale_vs_ops ? "medium" : "high";
    const conf: Confidence = freshness?.facilities_likely_stale_vs_ops ? "medium" : "high";
    issues.push({
      code: "facilities_row_when_not_racked_in_ops",
      tier: "drift",
      severity: sev,
      confidence: conf,
      summary: "Facilities rack assignment does not match operations state",
      detail: `Operations shows this asset as ${opsStateForManagers(asset.state)}. Expected: only in-service units are tracked in facilities—stored, receiving, RMA, and disposed units should not occupy a rack slot. If facilities still shows one, the walk is wrong or out of date.${staleNote}`,
      suggested_actions: [
        "Walk the floor: if the unit is truly off the rack, clear the facilities slot. If it is still racked, update operations with the correct scan.",
      ],
    });
  }

  if (facilitiesRowExpectedForOpsState(asset.state)) {
    if (!primaryFac) {
      issues.push({
        code: "in_service_missing_facilities",
        tier: "drift",
        severity: "high",
        confidence: "high",
        summary: "Operations shows the unit in service; facilities has no rack slot",
        detail:
          "The floor record shows deployed / racked, but facilities (CMMS) has no matching row. The facilities update from deploy may have failed or been skipped.",
        suggested_actions: [
          "Replay the facilities update from the deploy workflow, or add the rack string manually in facilities.",
        ],
      });
    } else {
      const expected = rackLocationFromOpsLocation(asset);
      if (expected && primaryFac.rack_location !== expected) {
        const stale = Boolean(freshness?.facilities_likely_stale_vs_ops);
        issues.push({
          code: "rack_location_mismatch",
          tier: "drift",
          severity: stale ? "medium" : "high",
          confidence: stale ? "medium" : "high",
          summary: "Facilities location differs from operations record",
          detail: stale
            ? `Operations: "${expected}". Facilities: "${primaryFac.rack_location}". ${freshness!.summary}`
            : `Operations: "${expected}". Facilities: "${primaryFac.rack_location}". Timestamps line up—someone likely updated only one system after the last move.`,
          suggested_actions: [
            "Confirm the label at the rack, then update whichever system is behind (often facilities after a good deploy scan).",
          ],
        });
      }
    }
  }

  // Finance presence
  if (!financeRow) {
    if (asset.state !== "unreceived") {
      const softReceive = asset.state === "received";
      issues.push({
        code: "finance_record_missing",
        tier: "drift",
        severity: softReceive ? "medium" : "high",
        confidence: softReceive ? "medium" : "high",
        summary: softReceive
          ? "Operations received; finance line not visible yet"
          : "Operations shows an active asset; finance has no record",
        detail: softReceive
          ? "Receiving can post to the floor before ERP opens the equipment line. Usually harmless unless the PO has been open a long time."
          : "Beyond receiving, every live tag is normally mirrored in finance for capitalization and audit.",
        suggested_actions: [
          softReceive
            ? "Wait a business day; if finance is still empty, ask them to attach the PO."
            : "Ask finance to create or link the equipment record for this tag.",
        ],
      });
    }
  } else {
    if (financeRow.site && asset.location.site && financeRow.site !== asset.location.site) {
      issues.push({
        code: "finance_site_mismatch",
        tier: "drift",
        severity: "medium",
        confidence: "low",
        summary: "Finance building does not match operations site",
        detail: `Finance: "${financeRow.site}". Operations: "${asset.location.site}". Different names for the same building happen often—confirm with a floor walk before moving money or equipment.`,
        suggested_actions: [
          "Pick one authoritative site name and align the lagging system after you verify the physical location.",
        ],
      });
    }

    if (asset.state === "disposed" && financeStatusConflictsWithDisposed(financeRow.status)) {
      const booksPhrase =
        financeRow.status === "capitalized"
          ? "Finance still shows this asset as capitalized while operations shows it disposed."
          : financeRow.status === "pending_receipt"
            ? "Operations shows disposed while finance still shows pending receipt."
            : `Operations shows disposed while finance shows ${financeRow.status}.`;
      issues.push({
        code: "disposed_ops_finance_still_active",
        tier: "needs_review",
        severity: "high",
        confidence: "medium",
        summary: "Disposed on the floor; books still look active",
        detail: `${booksPhrase} Close-out often lags a day or two when paperwork is in flight; it needs a person if disposal is final.`,
        suggested_actions: [
          "Finance: retire or adjust when disposal is final. If the dispose scan was wrong, correct the floor record per policy.",
        ],
      });
    }

    if (financeImpliesRetired(financeRow.status) && asset.state !== "disposed") {
      issues.push({
        code: "finance_retired_but_ops_active",
        tier: "needs_review",
        severity: "high",
        confidence: "medium",
        summary: "Finance retired the asset; operations still shows it active",
        detail:
          "The books say retired but custody on the floor is not disposed. Paperwork sometimes runs ahead of the retire scan, or finance may have retired the wrong line.",
        suggested_actions: [
          "Compare the retire date to the last scan; update the system that does not match what happened to the hardware.",
        ],
      });
    }

    if (asset.state === "received" && financeRow.status === "pending_receipt") {
      issues.push({
        code: "received_pending_finance_receipt",
        tier: "expected_difference",
        severity: "informational",
        confidence: "high",
        summary: "Expected: received in operations while finance awaits receipt",
        detail:
          "The unit is on the floor log; finance is still closing the PO. This is normal and does not mean the systems contradict each other.",
        suggested_actions: ["Nudge procurement only if the receipt has been open longer than your local SLA."],
      });
    }

    if (asset.state === "in_service" && financeRow.status === "pending_receipt") {
      issues.push({
        code: "in_service_finance_pending_cap",
        tier: "expected_difference",
        severity: "low",
        confidence: "medium",
        summary: "Expected: deployed in operations before finance finishes receipt",
        detail:
          "Some sites rack the unit before the PO fully posts. Check with finance if depreciation should already be running—no rack correction needed from this finding alone.",
        suggested_actions: [
          "Finance: confirm the PO line will capitalize; the floor team can stand down unless told otherwise.",
        ],
      });
    }
  }

  return { asset_tag, presence, context, issues };
}

function escalateCategory(issues: ReconciliationIssue[]): ReconciliationCategory {
  if (issues.length === 0) return "healthy";
  let worst = issues[0]!.tier;
  for (const i of issues) {
    worst = maxTier(worst, i.tier);
  }
  return TIER_TO_CATEGORY[worst];
}

function drivingIssue(category: ReconciliationCategory, issues: ReconciliationIssue[]): ReconciliationIssue {
  const inTier = issues.filter((i) => TIER_TO_CATEGORY[i.tier] === category);
  const pool = inTier.length ? inTier : issues;
  return pool.reduce((a, b) => {
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] < SEVERITY_RANK[b.severity] ? a : b;
    }
    return tierRank(a.tier) <= tierRank(b.tier) ? a : b;
  });
}

function buildHeadline(category: ReconciliationCategory, issues: ReconciliationIssue[]): string {
  if (category === "healthy") return "Floor, rack view, and books agree";
  return drivingIssue(category, issues).summary;
}

function buildExplanation(category: ReconciliationCategory, issues: ReconciliationIssue[]): string {
  if (category === "healthy") {
    return "This tag follows the usual rules: rack data only where the unit is in service, finance status matches the life cycle, and nothing looks out of place.";
  }
  return issues.map((i) => i.detail).join("\n\n");
}

function finalizeItem(asset_tag: string, partial: ReturnType<typeof reconcileJoinedRow>): ReconciliationItem {
  const category = escalateCategory(partial.issues);
  const headline = buildHeadline(category, partial.issues);
  const explanation = buildExplanation(category, partial.issues);
  const suggested_actions = dedupeActions(partial.issues.flatMap((i) => i.suggested_actions));
  const row_severity = aggregateRowSeverity(partial.issues);
  const row_confidence = aggregateRowConfidence(partial.issues);

  return {
    asset_tag,
    category,
    row_severity,
    row_confidence,
    sort_key: CATEGORY_RANK[category],
    headline,
    explanation,
    suggested_actions,
    presence: partial.presence,
    context: partial.context,
    issues: partial.issues,
  };
}

export function buildReconciliationReport(
  assets: Asset[],
  facilities: FacilitiesRecord[],
  finance: FinanceRecord[],
  now: Date = new Date(),
): ReconciliationReport {
  const tags = collectAssetTags(assets, facilities, finance);
  const assetByTag = new Map(assets.map((a) => [a.asset_tag, a] as const));
  const facByTag = groupFacilitiesByTag(facilities);
  const finByTag = groupFinanceByTag(finance);

  const items = tags.map((tag) =>
    finalizeItem(
      tag,
      reconcileJoinedRow(
        tag,
        assetByTag.get(tag) ?? null,
        facByTag.get(tag) ?? [],
        finByTag.get(tag) ?? [],
      ),
    ),
  );

  items.sort((a, b) => {
    if (a.sort_key !== b.sort_key) return a.sort_key - b.sort_key;
    if (a.row_severity !== "none" && b.row_severity !== "none") {
      const sr = SEVERITY_RANK[a.row_severity] - SEVERITY_RANK[b.row_severity];
      if (sr !== 0) return sr;
    }
    return a.asset_tag.localeCompare(b.asset_tag);
  });

  const summary = {
    healthy: 0,
    expected_difference: 0,
    drift: 0,
    needs_review: 0,
    total_tags: tags.length,
    orphan_facilities: 0,
    orphan_finance: 0,
  };

  for (const row of items) {
    summary[row.category]++;
    if (!row.presence.operations && row.presence.facilities) summary.orphan_facilities++;
    if (!row.presence.operations && row.presence.finance) summary.orphan_finance++;
  }

  return {
    generated_at: now.toISOString(),
    summary,
    items,
  };
}
