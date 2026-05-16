import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const TAG_RE = /^C\d{7}$/;

/**
 * After a successful store scan from in_service, clear the facilities mock row server-side
 * (token stays on the server — browser only posts asset_tag).
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

  const b = body as { asset_tag?: unknown };
  const asset_tag = typeof b.asset_tag === "string" ? b.asset_tag.trim().toUpperCase() : "";
  if (!TAG_RE.test(asset_tag)) {
    return NextResponse.json(
      { error: { code: "invalid_tag_format", message: "asset_tag must match C + 7 digits." } },
      { status: 400 },
    );
  }

  try {
    await api.mock.updateFacilities({
      tagged_id: asset_tag,
      rack_location: null,
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
    const message = err instanceof Error ? err.message : "Store de-rack sync failed.";
    return NextResponse.json({ error: { code: "store_derack_sync_failed", message } }, { status: 500 });
  }
}
