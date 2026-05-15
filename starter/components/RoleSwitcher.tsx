"use client";

import { getRole, setRole, type Role } from "@/lib/auth";
import { usePathname, useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";

export function RoleSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRoleState] = useState<Role>("tech");

  useLayoutEffect(() => {
    // Keep cookie aligned with URL (manual address-bar edits bypass route layout intent).
    if (pathname.startsWith("/manager")) {
      setRole("manager");
    } else if (pathname.startsWith("/tech")) {
      setRole("tech");
    }
    setRoleState(getRole());
  }, [pathname]);

  function handleClick(): void {
    const next: Role = role === "tech" ? "manager" : "tech";
    setRole(next);
    setRoleState(next);
    if (next === "manager") {
      router.push("/manager");
    } else {
      router.push("/tech");
    }
  }

  const label =
    role === "tech" ? "Switch to manager view" : "Switch to tech view";

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 min-h-[44px]"
      aria-label={label}
    >
      <span className="text-gray-500 mr-2">role: {role}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
