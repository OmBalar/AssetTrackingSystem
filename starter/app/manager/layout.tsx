import { SyncRouteRole } from "@/components/SyncRouteRole";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return <SyncRouteRole expectedRole="manager">{children}</SyncRouteRole>;
}
