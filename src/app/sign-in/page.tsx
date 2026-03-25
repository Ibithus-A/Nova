import { SignInPortal } from "@/components/sign-in-portal";
import { DEFAULT_AUTH_REDIRECT } from "@/lib/auth";

type SignInPageProps = {
  searchParams?: Promise<{
    redirect?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const redirectTo =
    params?.redirect && params.redirect.startsWith("/")
      ? params.redirect
      : DEFAULT_AUTH_REDIRECT;

  return <SignInPortal redirectTo={redirectTo} />;
}
