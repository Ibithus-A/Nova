import type { Metadata } from "next";
import Link from "next/link";

import { HomeLogoLink } from "@/components/home-logo-link";
import { ScrollReset } from "@/components/scroll-reset";

import "./globals.css";

export const metadata: Metadata = {
  title: "Nova",
  description: "Beginner-friendly financial updates that explain complex market news clearly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-[var(--background)] font-sans text-[var(--text)] antialiased">
        <ScrollReset />

        <a
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] rounded-md bg-black px-3 py-2 text-sm text-white"
          href="#main-content"
        >
          Skip to main content
        </a>

        <header className="sticky top-0 z-50">
          <div className="border-b border-black/10 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
            <div className="container-shell flex h-14 items-center justify-between">
              <HomeLogoLink />

              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-3 sm:flex">
                  <Link className="ui-link" href="/">
                    Product
                  </Link>
                  <Link className="ui-link" href="/#pricing">
                    Pricing
                  </Link>
                </div>
                <Link className="btn btn-ghost btn-sm" href="/sign-in">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </header>

        <div className="animate-page-enter flex-1">{children}</div>
      </body>
    </html>
  );
}
