export const AUTH_STORAGE_KEY = "nova-auth-session";
export const DEFAULT_AUTH_REDIRECT = "/workspace";

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
