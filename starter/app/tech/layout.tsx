import { SyncRouteRole } from "@/components/SyncRouteRole";
import { TechHomeBar } from "@/components/TechHomeBar";
import { TechUpstreamGate } from "@/components/TechUpstreamGate";

export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <SyncRouteRole expectedRole="tech">
      <TechHomeBar />
      <TechUpstreamGate>{children}</TechUpstreamGate>
    </SyncRouteRole>
  );
}
