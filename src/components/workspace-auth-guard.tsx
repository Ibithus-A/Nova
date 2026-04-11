"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { AdminWorkspace } from "@/components/admin-workspace";
import { getAuthSessionSnapshot, subscribeToAuthState } from "@/lib/auth";

export function WorkspaceAuthGuard() {
  const router = useRouter();
  const authSession = useSyncExternalStore(
    subscribeToAuthState,
    getAuthSessionSnapshot,
    () => null,
  );

  useEffect(() => {
    if (authSession) {
      return;
    }

    router.replace("/");
  }, [authSession, router]);

  if (authSession) {
    return <AdminWorkspace />;
  }

  return null;
}
