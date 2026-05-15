"use client";

import { type Role, getRole, setRole } from "@/lib/auth";
import { Fragment, type ReactNode, useLayoutEffect, useState } from "react";

/**
 * Locks the asset-challenge-role cookie to the site area (tech vs manager routes).
 * If the cookie did not match (e.g. deep-link), correcting it increments a keyed
 * remount so pages that call `getCurrentUserId()` during render pick up the new role.
 */
export function SyncRouteRole({
  expectedRole,
  children,
}: {
  expectedRole: Role;
  children: ReactNode;
}) {
  const [remountNonce, setRemountNonce] = useState(0);

  useLayoutEffect(() => {
    if (getRole() !== expectedRole) {
      setRole(expectedRole);
      setRemountNonce((n) => n + 1);
    }
  }, [expectedRole]);

  return <Fragment key={remountNonce}>{children}</Fragment>;
}
