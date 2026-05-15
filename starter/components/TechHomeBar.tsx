"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Shown above tech workflow pages — hidden on `/tech` itself. */
export function TechHomeBar() {
  const pathname = usePathname();
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/tech") return null;

  return (
    <div className="mb-5">
      <Link
        href="/tech"
        className="inline-flex w-full max-w-md items-center justify-center rounded-xl border-2 border-gray-200 bg-white px-6 py-5 text-lg font-semibold text-gray-900 shadow-sm transition hover:border-blue-400 hover:bg-blue-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:min-h-[3.75rem]"
      >
        Tech home
      </Link>
    </div>
  );
}
