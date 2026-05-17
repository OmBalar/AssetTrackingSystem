import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-10">

        {/* Hero */}
        <section>
          <h1 className="text-3xl font-bold text-gray-900">
            Lab Asset Tracking
          </h1>
          <p className="mt-3 max-w-2xl text-gray-600 leading-relaxed">
            Three systems — operations, facilities, and finance — each hold a
            partial view of ~1,000 instruments across multiple sites. Use the
            role switcher in the header to act as a lab technician or an asset
            manager.
          </p>
        </section>

        {/* Role cards */}
        <section className="grid gap-6 sm:grid-cols-2">

          {/* Tech */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">🔬</span>
              <h2 className="text-lg font-semibold text-gray-900">Technician</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Scan workflows optimized for dock bays and cold storage — works
              with a USB scanner or phone camera.
            </p>
            <ul className="space-y-2">
              {[
                { href: "/tech/receive", label: "Receive", desc: "New and duplicate assets" },
                { href: "/tech/store", label: "Store", desc: "Put-away to storage" },
                { href: "/tech/deploy", label: "Deploy", desc: "Rack to in-service" },
                { href: "/tech/transfer", label: "Transfer", desc: "Hand off custody" },
              ].map(({ href, label, desc }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                  >
                    <span className="font-medium text-gray-900 group-hover:text-blue-700">{label}</span>
                    <span className="text-gray-400 text-xs">{desc}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Manager */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-2xl">📊</span>
              <h2 className="text-lg font-semibold text-gray-900">Manager</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Desktop dashboard for Monday morning triage — asset list,
              event history, and three-way reconciliation.
            </p>
            <ul className="space-y-2">
              {[
                { href: "/manager", label: "Asset list", desc: "Filter, search, paginate" },
                { href: "/manager/reconcile", label: "Reconciliation", desc: "Ops · facilities · finance" },
              ].map(({ href, label, desc }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5 text-sm hover:border-blue-300 hover:bg-blue-50 transition-colors group"
                  >
                    <span className="font-medium text-gray-900 group-hover:text-blue-700">{label}</span>
                    <span className="text-gray-400 text-xs">{desc}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
              <Link
                href="/dev/barcodes"
                className="flex items-center justify-between text-sm group"
              >
                <span className="font-medium text-gray-900 group-hover:text-blue-700">Test barcodes</span>
                <span className="text-gray-400 text-xs">Scannable QR codes</span>
              </Link>
            </div>
          </div>

        </section>

        {/* Quick start */}
        <section className="rounded-xl border border-blue-100 bg-blue-50 px-6 py-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-3">Quick start</h2>
          <ol className="list-decimal ml-4 space-y-1.5 text-sm text-blue-800">
            <li>Switch roles using the header — technician for scan flows, manager for the dashboard.</li>
            <li>Use <strong>Test barcodes</strong> to generate scannable QR codes for interesting asset cases.</li>
            <li>After deploying an asset, check <strong>Reconciliation</strong> to verify facilities and finance are in sync.</li>
          </ol>
        </section>

      </div>
    </div>
  );
}