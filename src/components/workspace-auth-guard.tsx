"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { AdminWorkspace } from "@/components/admin-workspace";
import { AUTH_STORAGE_KEY, buildSignInHref } from "@/lib/auth";

function subscribeToAuthState(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
  };
}

function getAuthSessionSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

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

    router.replace(buildSignInHref("/workspace"));
  }, [authSession, router]);

  if (authSession) {
    return <AdminWorkspace />;
  }

  return null;
}
