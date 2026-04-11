export const AUTH_STORAGE_KEY = "nova-auth-session";
export const DEFAULT_AUTH_REDIRECT = "/workspace";

export type LocalAuthSession = {
  email: string;
  signedInAt: number;
};

export function buildSignInHref(redirectTo = DEFAULT_AUTH_REDIRECT) {
  const params = new URLSearchParams({ redirect: redirectTo });
  return `/sign-in?${params.toString()}`;
}

export function createLocalAuthSession(email: string) {
  return JSON.stringify({
    email,
    signedInAt: Date.now(),
  });
}

export function subscribeToAuthState(onStoreChange: () => void) {
  const handleChange = () => onStoreChange();

  window.addEventListener("storage", handleChange);
  window.addEventListener("nova-auth-change", handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener("nova-auth-change", handleChange);
  };
}

export function getAuthSessionSnapshot() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

export function parseLocalAuthSession(rawSession: string | null): LocalAuthSession | null {
  if (!rawSession) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawSession) as Partial<LocalAuthSession>;
    if (typeof parsed.email !== "string" || typeof parsed.signedInAt !== "number") {
      return null;
    }

    return {
      email: parsed.email,
      signedInAt: parsed.signedInAt,
    };
  } catch {
    return null;
  }
}

export function notifyAuthStateChanged() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event("nova-auth-change"));
}
