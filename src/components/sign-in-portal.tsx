"use client";

import { MoveRight, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { PageShell, Panel } from "@/components/page-shell";
import {
  AUTH_STORAGE_KEY,
  DEFAULT_AUTH_REDIRECT,
  createLocalAuthSession,
} from "@/lib/auth";

const trustSignals = [
  "Beginner-friendly market briefings",
  "Your workspace map and saved pages",
  "A calmer way to follow fast-moving news",
];

type SignInPortalProps = {
  redirectTo?: string;
};

export function SignInPortal({ redirectTo = DEFAULT_AUTH_REDIRECT }: SignInPortalProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const safeEmail = email.trim() || "reader@nova.ai";
    window.localStorage.setItem(AUTH_STORAGE_KEY, createLocalAuthSession(safeEmail));

    router.push(redirectTo);
  };

  const handleBypass = () => {
    setIsSubmitting(true);
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      createLocalAuthSession("guest@nova.local"),
    );
    router.push(redirectTo);
  };

  return (
    <PageShell width="wide">
      <section className="signin-layout">
        <Panel padded="lg" className="signin-hero">
          <div className="stack-16">
            <div className="metric-badge">Sign in portal</div>
            <div className="stack-12">
              <h1 className="section-title signin-title">
                Your market briefings, graph workspace, and saved reading flow all live behind one clean entry point.
              </h1>
              <p className="body-copy max-w-xl">
                A simple sign-in keeps your experience consistent, focused, and ready to open exactly where you left
                off.
              </p>
            </div>
          </div>

          <div className="signin-hero-grid">
            {trustSignals.map((signal) => (
              <div key={signal} className="signin-signal">
                <Sparkles size={14} />
                <span>{signal}</span>
              </div>
            ))}
          </div>

          <div className="signin-preview">
            <div className="signin-preview-header">
              <span className="section-label">Access</span>
            </div>
            <div className="signin-preview-copy-block">
              <p className="signin-preview-title">Direct access resumes as soon as you sign in.</p>
              <p className="signin-preview-copy">
                A single sign-in unlocks your saved workspace and brings you straight back into the product without
                an extra step in the middle.
              </p>
            </div>
            <div className="signin-preview-grid">
              <div className="signin-preview-detail">
                <span className="signin-preview-detail-label">Redirect</span>
                <span className="signin-preview-detail-value">{redirectTo}</span>
              </div>
              <div className="signin-preview-detail">
                <span className="signin-preview-detail-label">Status</span>
                <span className="signin-preview-status">Ready after sign-in</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel padded="lg" className="signin-panel">
          <form className="signin-form" onSubmit={handleSubmit}>
            <div className="stack-12">
              <p className="section-label">Welcome back</p>
              <div className="stack-12">
                <h2 className="h2">Continue to workspace</h2>
                <p className="body-copy">
                  Use any email and password for this UI flow, or bypass sign-in for now while real authentication is
                  still being built.
                </p>
              </div>
            </div>

            <label className="signin-field">
              <span className="signin-label">Email</span>
              <input
                autoComplete="email"
                className="signin-input"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="reader@nova.ai"
                required
                type="email"
                value={email}
              />
            </label>

            <label className="signin-field">
              <span className="signin-label">Password</span>
              <input
                autoComplete="current-password"
                className="signin-input"
                minLength={6}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </label>

            <button className="btn btn-primary btn-lg signin-submit" disabled={isSubmitting} type="submit">
              <span>{isSubmitting ? "Opening workspace..." : "Sign in"}</span>
              <MoveRight size={16} />
            </button>

            <button
              className="btn btn-secondary btn-lg signin-bypass"
              disabled={isSubmitting}
              onClick={handleBypass}
              type="button"
            >
              <span>Continue without sign-in</span>
            </button>
          </form>
        </Panel>
      </section>
    </PageShell>
  );
}
