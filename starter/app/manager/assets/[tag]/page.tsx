import { ManagerAssetDetail } from "@/components/ManagerAssetDetail";

export default async function ManagerAssetDetailPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  return <ManagerAssetDetail routeTag={decodeURIComponent(tag)} />;
}
