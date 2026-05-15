"use client";

import { api } from "@/lib/api-client";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type HealthState = "checking" | "up" | "down";

/**
 * Before tech workflows run scans, ensure `GET /health` (proxied as `/api/upstream/health`)
 * succeeds. Re-checks on route changes and when the tab becomes visible again.
 */
export function TechUpstreamGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthState>("checking");

  const runCheck = useCallback(async () => {
    setHealth("checking");
    try {
      const res = await api.health();
      setHealth(res?.ok === true ? "up" : "down");
    } catch {
      setHealth("down");
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [pathname, runCheck]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void runCheck();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [runCheck]);

  const isDown = health === "down";
  const isChecking = health === "checking";

  return (
    <div className="relative">
      {(isChecking || isDown) && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            isDown
              ? "border-rose-200 bg-rose-50 text-rose-950"
              : "border-slate-200 bg-slate-50 text-slate-800"
          }`}
          role="status"
          aria-live="polite"
        >
          {isChecking ? (
            <p className="font-medium">Checking connection to the asset API…</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Asset API is not reachable</p>
                <p className="mt-1 text-xs text-rose-900/90">
                  Please retry in a moment. If the problem persists, contact your administrator to check the API server and your network connection.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void runCheck()}
                className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-950 shadow-sm hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
      <div
        inert={isDown ? true : undefined}
        aria-hidden={isDown ? true : undefined}
        className={isDown ? "select-none opacity-60" : undefined}
      >
        {children}
      </div>
    </div>
  );
}
