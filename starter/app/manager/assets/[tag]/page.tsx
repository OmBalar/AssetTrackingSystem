import { ManagerAssetDetail } from "@/components/ManagerAssetDetail";
import { sanitizeManagerListQueryString } from "@/lib/manager-list-params";
import { api } from "@/lib/api-client";
import { buildReconciliationReport } from "@/lib/reconciliation";
import type { ReconciliationItem } from "@/lib/reconciliation";

function segmentFirst(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  const s = segmentFirst(v);
  return s !== "" ? s : undefined;
}

async function getReconciliationItem(tag: string): Promise<ReconciliationItem | null> {
  try {
    const [assets, facilities, finance] = await Promise.all([
      api.assets.list(),
      api.mock.facilities(),
      api.mock.finance(),
    ]);
    const report = buildReconciliationReport(assets, facilities, finance);
    return report.items.find((i) => i.asset_tag === tag) ?? null;
  } catch {
    return null;
  }
}

export default async function ManagerAssetDetailPage(props: {
  params?: Promise<{ tag?: string | string[] }>;
  searchParams?: Promise<{ back?: string | string[] }>;
}) {
  const [resolvedParams, resolvedSearch] = await Promise.all([
    props.params ?? Promise.resolve({}),
    props.searchParams ?? Promise.resolve({}),
  ]);

  const p = resolvedParams as { tag?: string | string[] };
  const sp = resolvedSearch as { back?: string | string[] };

  const routeTagRaw = segmentFirst(p.tag);
  const rawBack = firstSearchParam(sp.back);
  const safeBack = sanitizeManagerListQueryString(rawBack ?? "");
  const managerListHref = safeBack !== "" ? `/manager?${safeBack}` : "/manager";

  const tag = decodeURIComponent(routeTagRaw);
  const reconciliationItem = await getReconciliationItem(tag);

  return (
    <ManagerAssetDetail
      routeTag={tag}
      managerListHref={managerListHref}
      reconciliationItem={reconciliationItem}
    />
  );
}