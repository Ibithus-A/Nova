"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HomeLogoLink } from "@/components/home-logo-link";

export function SiteHeader() {
  const pathname = usePathname();

  if (pathname === "/sign-in" || pathname.startsWith("/workspace")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-black/10 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="container-shell flex h-14 items-center justify-between">
          <HomeLogoLink />

          <div className="flex items-center gap-3">
            <Link className="btn btn-ghost btn-sm" href="/sign-in">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
