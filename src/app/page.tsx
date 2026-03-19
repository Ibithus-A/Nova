"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { MarketingGraph } from "@/components/marketing-graph";
import { PageHeader, PageShell, Panel } from "@/components/page-shell";
import { Reveal } from "@/components/reveal";

export default function HomePage() {
  const [showLiveMap, setShowLiveMap] = useState(false);
  const shouldScrollToMapRef = useRef(false);

  useEffect(() => {
    const revealOnScroll = () => {
      if (window.scrollY > 120) {
        setShowLiveMap(true);
      }
    };

    window.addEventListener("scroll", revealOnScroll, { passive: true });
    revealOnScroll();

    return () => {
      window.removeEventListener("scroll", revealOnScroll);
    };
  }, []);

  useEffect(() => {
    if (!showLiveMap || !shouldScrollToMapRef.current) {
      return;
    }

    document.getElementById("live-map")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    shouldScrollToMapRef.current = false;
  }, [showLiveMap]);

  return (
    <PageShell>
      <div className="content-shell stack-56">
        <Reveal>
          <PageHeader
            eyebrow="Financial news for beginners"
            title="We take complex market updates and explain them clearly."
            description="Nova helps people understand major financial developments without the jargon. We break down fast-moving market news, explain why it matters, and keep readers updated in language beginners can actually follow."
            actions={
              <>
                <Link className="btn btn-primary btn-lg" href="#">
                  Get started
                </Link>
                <button
                  className="btn btn-secondary btn-lg"
                  onClick={() => {
                    if (showLiveMap) {
                      document.getElementById("live-map")?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                      return;
                    }

                    shouldScrollToMapRef.current = true;
                    setShowLiveMap(true);
                  }}
                  type="button"
                >
                  Learn more
                </button>
              </>
            }
          />
        </Reveal>

        {showLiveMap ? (
          <Reveal delay={60}>
            <MarketingGraph />
          </Reveal>
        ) : null}

        <Reveal delay={100}>
          <Panel padded="lg" className="section-intro" id="product-overview">
            <div className="metric-badge">What we do</div>
            <div className="section-intro">
              <h2 className="section-title">We turn confusing financial headlines into simple explanations.</h2>
              <p className="body-copy max-w-3xl">
                When markets move quickly, most coverage assumes readers already know the background. We close that
                gap by translating those updates into plain English and showing what changed, why it matters, and
                what to keep watching.
              </p>
            </div>
          </Panel>
        </Reveal>

        <Reveal delay={140}>
          <section className="section-stack-lg">
            <div className="section-intro text-center">
              <h2 className="section-title">How Nova helps readers make sense of the market</h2>
              <p className="body-copy mx-auto max-w-2xl">
                Every update is designed to feel clear, connected, and approachable, especially for people who are
                still learning how financial stories fit together.
              </p>
            </div>

            <div className="page-grid-tight md:grid-cols-3">
              <Panel padded="lg" className="feature-card h-full">
                <div className="metric-badge">01</div>
                <div className="feature-card-copy">
                  <h3 className="feature-card-title">Beginner-friendly explainers for major headlines</h3>
                  <p className="feature-card-body">
                    Readers get simple breakdowns of what happened, why it matters, and what the financial language
                    actually means.
                  </p>
                </div>
              </Panel>

              <Panel padded="lg" className="feature-card h-full">
                <div className="metric-badge">02</div>
                <div className="feature-card-copy">
                  <h3 className="feature-card-title">A clearer roadmap through connected market stories</h3>
                  <p className="feature-card-body">
                    Instead of isolated updates, Nova helps people follow how headlines, sectors, and themes connect
                    over time.
                  </p>
                </div>
              </Panel>

              <Panel padded="lg" className="feature-card h-full">
                <div className="metric-badge">03</div>
                <div className="feature-card-copy">
                  <h3 className="feature-card-title">One place to stay updated without feeling overwhelmed</h3>
                  <p className="feature-card-body">
                    The product gives readers a focused environment where they can keep up with the market at a pace
                    that feels manageable.
                  </p>
                </div>
              </Panel>
            </div>

            <div className="flex justify-center">
              <Link className="btn btn-primary btn-lg" href="/workspace">
                Open workspace
              </Link>
            </div>
          </section>
        </Reveal>

        <Reveal delay={180}>
          <section className="section-stack-lg" id="pricing">
            <div className="section-intro-tight">
              <div className="metric-badge">Pricing</div>
              <div className="section-intro-tight">
                <h2 className="section-title">Choose the level of market clarity you want.</h2>
                <p className="body-copy max-w-2xl">
                  Start with simple updates, unlock AI help as you grow, or move into a premium workspace built
                  around the map.
                </p>
              </div>
            </div>

            <div className="page-grid-tight md:grid-cols-2 xl:grid-cols-3">
              <Panel padded="lg" className="stack-20 h-full">
                <div className="stack-12">
                  <p className="section-label">Basic</p>
                  <h3 className="h2">Normal updates</h3>
                  <p className="pricing-value">$9<span className="pricing-period">/month</span></p>
                </div>
                <ul className="feature-list">
                  <li>Beginner-friendly market updates</li>
                  <li>Simple explainers for major headlines</li>
                  <li>Clear context on what changed</li>
                </ul>
                <Link className="btn btn-secondary btn-lg" href="/workspace">
                  Choose Basic for $9
                </Link>
              </Panel>

              <Panel padded="lg" className="stack-20 h-full">
                <div className="stack-12">
                  <p className="section-label">Plus</p>
                  <h3 className="h2">AI features</h3>
                  <p className="pricing-value">$19<span className="pricing-period">/month</span></p>
                </div>
                <ul className="feature-list">
                  <li>Everything in Basic</li>
                  <li>AI-assisted summaries and breakdowns</li>
                  <li>Smarter connections across related stories</li>
                </ul>
                <Link className="btn btn-primary btn-lg" href="/workspace">
                  Choose Plus for $19
                </Link>
              </Panel>

              <Panel padded="lg" className="stack-20 h-full md:col-span-2 xl:col-span-1">
                <div className="stack-12">
                  <p className="section-label">Premium</p>
                  <h3 className="h2">Workspace map</h3>
                  <p className="pricing-value">$49<span className="pricing-period">/month</span></p>
                </div>
                <ul className="feature-list">
                  <li>Everything in Plus</li>
                  <li>Interactive workspace-style market map</li>
                  <li>Deeper story exploration and navigation</li>
                </ul>
                <Link className="btn btn-secondary btn-lg" href="/workspace">
                  Choose Premium for $49
                </Link>
              </Panel>
            </div>
          </section>
        </Reveal>
      </div>
    </PageShell>
  );
}
