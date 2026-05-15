import Link from "next/link";

import { DevBarcodesClient } from "./ui";

export const metadata = {
  title: "Dev · Test barcodes",
  description: "Code 128 barcodes for QA scan / reconcile workflows",
};

export default function DevBarcodesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <p className="mb-6 text-sm text-gray-500">
        <Link href="/tech" className="text-blue-700 hover:underline">
          ← Tech home
        </Link>
      </p>
      <header className="mb-8 border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Dev — test barcodes</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          <strong>Receive</strong> defaults to <strong>manual</strong>; you can switch to <strong>camera</strong> on the
          asset-tag step. Camera path: tag + one <strong>EQ:</strong> equipment QR + one compact location QR. Manual path: tag +
          serial + manufacturer + model + type + site, room, rack (one field per screen). Compact{" "}
          <code className="rounded bg-gray-100 px-1">SITE/ROOM/RACK</code> QRs are still what <strong>store</strong> uses for
          put-away. Deploy still uses <strong>separate</strong> barcodes per field. After odd results,{" "}
          <code className="rounded bg-gray-100 px-1">POST /v1/reset</code> clears your namespace.
        </p>
      </header>
      <DevBarcodesClient />
    </div>
  );
}
