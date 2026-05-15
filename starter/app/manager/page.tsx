import { ManagerAssetList } from "@/components/ManagerAssetList";
import Link from "next/link";
import { Suspense } from "react";

export default function ManagerDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manager dashboard</h1>
          <p className="text-gray-600 mt-1 text-sm max-w-xl">
            Filter the operations view by state, site, and custodian. Rows open the timeline and
            event log — use Details if you prefer a clear control.
          </p>
        </div>
        <Link
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          href="/manager/reconcile"
        >
          Three-way reconciliation
        </Link>
      </div>
      <Suspense
        fallback={
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Loading dashboard…
          </div>
        }
      >
        <ManagerAssetList />
      </Suspense>
    </div>
  );
}
