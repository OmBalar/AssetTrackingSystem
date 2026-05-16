import { ManagerAssetDetail } from "@/components/ManagerAssetDetail";
import { sanitizeManagerListQueryString } from "@/lib/manager-list-params";

function segmentFirst(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

function firstSearchParam(v: string | string[] | undefined): string | undefined {
  const s = segmentFirst(v);
  return s !== "" ? s : undefined;
}

/** Matches Next.js generated `PageProps` (promised `params` / `searchParams`). */
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

  return (
    <ManagerAssetDetail routeTag={decodeURIComponent(routeTagRaw)} managerListHref={managerListHref} />
  );
}
