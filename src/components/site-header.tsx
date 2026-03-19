"use client";

import { usePathname } from "next/navigation";

import { HomeLogoLink } from "@/components/home-logo-link";

export function SiteHeader() {
  const pathname = usePathname();

  if (pathname.startsWith("/workspace")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50">
      <div className="border-b border-black/10 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <div className="container-shell flex h-14 items-center">
          <HomeLogoLink />
        </div>
      </div>
    </header>
  );
}
