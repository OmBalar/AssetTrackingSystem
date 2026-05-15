import { ManagerAssetDetail } from "@/components/ManagerAssetDetail";
import { Suspense } from "react";

export default async function ManagerAssetDetailPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          Loading asset…
        </div>
      }
    >
      <ManagerAssetDetail routeTag={decodeURIComponent(tag)} />
    </Suspense>
  );
}
