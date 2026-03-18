import type { Metadata } from "next";

import { ScrollReset } from "@/components/scroll-reset";
import { SiteHeader } from "@/components/site-header";

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

        <SiteHeader />

        <div className="animate-page-enter flex-1">{children}</div>
      </body>
    </html>
  );
}
