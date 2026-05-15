import { SyncRouteRole } from "@/components/SyncRouteRole";
import { TechHomeBar } from "@/components/TechHomeBar";

export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <SyncRouteRole expectedRole="tech">
      <TechHomeBar />
      {children}
    </SyncRouteRole>
  );
}
