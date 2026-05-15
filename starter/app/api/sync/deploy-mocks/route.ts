import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api-client";
import type { Location } from "@/lib/types";
import { facilitiesRackPath, isDeployPlaceable } from "@/lib/tech-scan-helpers";

export const dynamic = "force-dynamic";

const TAG_RE = /^C\d{7}$/;

function parseLocationBody(raw: unknown): Location | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const site = typeof o.site === "string" ? o.site : "";
  const room = o.room === null || typeof o.room === "string" ? o.room : null;
  const row = o.row === null || typeof o.row === "string" ? o.row : null;
  const rack = o.rack === null || typeof o.rack === "string" ? o.rack : null;
  const ru = o.ru === null || typeof o.ru === "string" ? o.ru : null;
  return { site, room, row, rack, ru };
}

/**
 * After a successful ops deploy scan, sync facilities + finance mocks server-side
 * (token stays on the server — browser only posts tag + location).
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_json", message: "Request body must be JSON." } },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "Expected a JSON object." } },
      { status: 400 },
    );
  }

  const b = body as { asset_tag?: unknown; location?: unknown };
  const asset_tag = typeof b.asset_tag === "string" ? b.asset_tag.trim().toUpperCase() : "";
  if (!TAG_RE.test(asset_tag)) {
    return NextResponse.json(
      { error: { code: "invalid_tag_format", message: "asset_tag must match C + 7 digits." } },
      { status: 400 },
    );
  }

  const location = parseLocationBody(b.location);
  if (!location) {
    return NextResponse.json(
      { error: { code: "invalid_body", message: "location object with site, room, rack, ru required." } },
      { status: 400 },
    );
  }

  if (!isDeployPlaceable(location)) {
    return NextResponse.json(
      {
        error: {
          code: "incomplete_deploy_location",
          message: "Deploy sync requires site, room, rack, and RU.",
          details: { location },
        },
      },
      { status: 422 },
    );
  }

  try {
    const rackPath = facilitiesRackPath(location);
    await api.mock.updateFacilities({
      tagged_id: asset_tag,
      rack_location: rackPath,
    });
    const capitalizedOn = new Date().toISOString().slice(0, 10);
    await api.mock.updateFinance({
      tag: asset_tag,
      site: location.site.trim(),
      status: "capitalized",
      capitalized_on: capitalizedOn,
    });
    return NextResponse.json({ ok: true as const });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        },
        { status: err.status >= 400 && err.status < 600 ? err.status : 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Deploy sync failed.";
    return NextResponse.json({ error: { code: "deploy_sync_failed", message } }, { status: 500 });
  }
}
