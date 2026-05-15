import { NextResponse } from "next/server";

import { api, ApiError } from "@/lib/api-client";
import { buildReconciliationReport } from "@/lib/reconciliation";

export const dynamic = "force-dynamic";

/**
 * Three-way reconciliation: operations (assets API) + facilities mock + finance mock.
 * Join key: asset tag (`asset_tag` / `tagged_id` / `tag`).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [assets, facilities, finance] = await Promise.all([
      api.assets.list(),
      api.mock.facilities(),
      api.mock.finance(),
    ]);

    const report = buildReconciliationReport(assets, facilities, finance);

    return NextResponse.json({
      meta: {
        schema: "reconciliation.v1",
        sources: {
          operations: "/v1/assets",
          facilities: "/v1/mock/facilities/spaces",
          finance: "/v1/mock/finance/equipment",
        },
      },
      ...report,
    });
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

    const message = err instanceof Error ? err.message : "Something unexpected happened on the server.";
    const isConfig = /API_TOKEN|Missing API_TOKEN/i.test(message);
    return NextResponse.json(
      {
        error: {
          code: isConfig ? "missing_configuration" : "reconcile_failed",
          message,
        },
      },
      { status: 500 },
    );
  }
}
