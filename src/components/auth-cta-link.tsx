"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { buildSignInHref } from "@/lib/auth";

type AuthCtaLinkProps = {
  children: ReactNode;
  className?: string;
  redirectTo?: string;
  scroll?: boolean;
};

export function AuthCtaLink({
  children,
  className,
  redirectTo,
  scroll,
}: AuthCtaLinkProps) {
  return (
    <Link className={className} href={buildSignInHref(redirectTo)} scroll={scroll}>
      {children}
    </Link>
  );
}
