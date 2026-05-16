import type { Asset, Location } from "@/lib/types";

export function humanizeState(state: string): string {
  return state.replace(/_/g, " ");
}

export function compactLocation(loc: Location): string {
  const segments = [
    loc.site,
    loc.room ?? undefined,
    loc.row ?? undefined,
    loc.rack ?? undefined,
    loc.ru ?? undefined,
  ].filter((s): s is string => Boolean(s?.trim()));
  return segments.join(" / ");
}

export function facilitiesRackPath(loc: Location): string {
  return [loc.site, loc.room, loc.row, loc.rack, loc.ru]
    .filter((s): s is string => Boolean(s?.trim()))
    .join("/");
}

export function isDeployPlaceable(loc: Location): boolean {
  return Boolean(loc.site.trim() && loc.room?.trim() && loc.rack?.trim() && loc.ru?.trim());
}

/** Rows for success summaries (toast/banners) — omits empty optional fields. */
export function assetSuccessDetailRows(asset: Asset): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: "Asset tag", value: asset.asset_tag.trim() },
    { label: "Serial", value: asset.serial.trim() },
    { label: "Manufacturer", value: asset.manufacturer.trim() },
    { label: "Model", value: asset.model.trim() },
    { label: "Asset class", value: asset.asset_class.trim() },
    { label: "State", value: humanizeState(asset.state) },
    { label: "Location", value: compactLocation(asset.location) },
  ];
  return rows.filter((r) => r.value.length > 0);
}
