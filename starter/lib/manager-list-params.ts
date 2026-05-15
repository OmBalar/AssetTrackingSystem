export const MANAGER_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const PARAM_KEYS = ["state", "site", "custodian", "page", "ps"] as const;

export function parseManagerListPageSize(s: string | null | undefined): number {
  const n = Number.parseInt(s ?? "", 10);
  return MANAGER_LIST_PAGE_SIZE_OPTIONS.includes(
    n as (typeof MANAGER_LIST_PAGE_SIZE_OPTIONS)[number],
  )
    ? n
    : MANAGER_LIST_PAGE_SIZE_OPTIONS[0];
}

/** Keep only known list keys so `back` cannot inject arbitrary query params. */
export function sanitizeManagerListQueryString(raw: string | null): string {
  if (!raw) return "";
  const incoming = new URLSearchParams(raw);
  const out = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    const v = incoming.get(key);
    if (v != null && v !== "") out.set(key, v);
  }
  return out.toString();
}
