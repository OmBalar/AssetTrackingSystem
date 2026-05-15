import type { Location } from "@/lib/types";

/** Title-cases underscore-separated identifiers (states, event types, etc.). */
export function labelTitleCase(value: string): string {
  return value
    .split("_")
    .map((word) => {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function compactLocation(loc: Location | null): string {
  if (!loc) return "—";
  const segments = [
    loc.site,
    loc.room ?? undefined,
    loc.row ?? undefined,
    loc.rack ?? undefined,
    loc.ru ?? undefined,
  ].filter((s): s is string => Boolean(s?.trim()));
  return segments.length > 0 ? segments.join(" / ") : loc.site;
}

export function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
