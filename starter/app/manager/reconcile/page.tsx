import { ManagerReconcileDashboard } from "@/components/ManagerReconcileDashboard";
import Link from "next/link";

export default function ManagerReconcilePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reconciliation</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Floor, facilities rack view, and finance in one pass—built for a short stand-up. Start under{" "}
            <span className="font-medium text-gray-800">Clear decisions needed</span>, then{" "}
            <span className="font-medium text-gray-800">Straightforward fixes</span>.
          </p>
        </div>
        <Link
          href="/manager"
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Manager home
        </Link>
      </div>
      <ManagerReconcileDashboard />
    </div>
  );
}
