import Link from "next/link";

import { PageShell, Panel } from "@/components/page-shell";

export default function SignInPage() {
  return (
    <PageShell width="narrow">
      <div className="content-shell-narrow section-stack-lg">
        <div className="section-intro-tight">
          <p className="section-label">User portal</p>
          <h1 className="section-title">Sign in to your account</h1>
          <p className="body-lead max-w-2xl">
            Access your account to read the latest published market commentary and follow updates from the
            centralized publishing team.
          </p>
        </div>

        <Panel padded="lg" className="section-stack">
          <form className="section-stack">
            <div className="section-intro-tight">
              <label className="section-label" htmlFor="email">
                Email
              </label>
              <input
                className="w-full rounded-[1rem] border border-black/10 bg-white px-4 py-3 text-sm text-[#1d1d1f] outline-none transition focus:border-black/25"
                id="email"
                name="email"
                placeholder="you@example.com"
                type="email"
              />
            </div>

            <div className="section-intro-tight">
              <label className="section-label" htmlFor="password">
                Password
              </label>
              <input
                className="w-full rounded-[1rem] border border-black/10 bg-white px-4 py-3 text-sm text-[#1d1d1f] outline-none transition focus:border-black/25"
                id="password"
                name="password"
                placeholder="Enter your password"
                type="password"
              />
              <Link className="ui-link w-fit" href="/">
                Forgot password?
              </Link>
            </div>

            <div className="cluster-actions">
              <button className="btn btn-primary btn-lg" type="submit">
                Sign in
              </button>
              <Link className="btn btn-secondary btn-lg" href="/workspace">
                Bypass
              </Link>
              <Link className="btn btn-secondary btn-lg" href="/">
                Back to landing page
              </Link>
            </div>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
