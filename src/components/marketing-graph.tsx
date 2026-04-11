"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildSignInHref } from "@/lib/auth";

type GraphNode = {
  id: string;
  label: string;
  href: string;
  x: number;
  y: number;
  mobileX?: number;
  mobileY?: number;
  muted?: boolean;
  eyebrow: string;
  description: string;
  meta: string;
};

const graphNodes: GraphNode[] = [
  {
    id: "rates",
    label: "What rising interest rates mean",
    href: buildSignInHref("/workspace"),
    x: 50,
    y: 16,
    mobileX: 50,
    mobileY: 16,
    eyebrow: "Macro note",
    description: "A short explainer page that translates central bank policy into portfolio impact.",
    meta: "Links to inflation, jobs, and banking",
  },
  {
    id: "ai",
    label: "NVIDIA and AI demand explained",
    href: buildSignInHref("/workspace"),
    x: 78,
    y: 30,
    mobileX: 73,
    mobileY: 36,
    eyebrow: "Company thread",
    description: "Connects earnings context, supply chain notes, and second-order winners into one page.",
    meta: "Assigned PDFs and connected pages",
  },
  {
    id: "trade",
    label: "China chip restrictions in plain English",
    href: buildSignInHref("/workspace"),
    x: 77,
    y: 68,
    mobileX: 72,
    mobileY: 74,
    eyebrow: "Policy theme",
    description: "Tracks export controls, likely knock-on effects, and the companies exposed to them.",
    meta: "Related to AI demand and semis",
  },
  {
    id: "inflation",
    label: "Inflation update for beginners",
    href: buildSignInHref("/workspace"),
    x: 26,
    y: 34,
    mobileX: 24,
    mobileY: 34,
    eyebrow: "Weekly update",
    description: "A clean briefing page where dense CPI and pricing updates become readable and connected.",
    meta: "Feeds rates and policy coverage",
  },
  {
    id: "jobs",
    label: "Jobs data without the jargon",
    href: buildSignInHref("/workspace"),
    x: 31,
    y: 66,
    mobileX: 27,
    mobileY: 70,
    eyebrow: "Economic data",
    description: "Shows how labor market changes flow through to consumer strength, policy, and equities.",
    meta: "Connected to inflation and rates",
  },
  {
    id: "central",
    label: "Complex market news, made simple",
    href: "#product-overview",
    x: 52,
    y: 49,
    mobileX: 50,
    mobileY: 52,
    eyebrow: "Workspace hub",
    description: "The central page where related themes, deals, and explanations converge inside the graph.",
    meta: "This is the node everything rolls up into",
  },
  {
    id: "banking",
    label: "Why banking moves markets",
    href: buildSignInHref("/workspace"),
    x: 63,
    y: 38,
    mobileX: 62,
    mobileY: 48,
    eyebrow: "Sector page",
    description: "A structured note that ties balance sheets, rates, and credit conditions into one view.",
    meta: "Links macro and company-specific research",
  },
  {
    id: "beginner",
    label: "Beginner-first explainers",
    href: "#product-overview",
    x: 45,
    y: 78,
    mobileX: 44,
    mobileY: 86,
    muted: true,
    eyebrow: "Reading layer",
    description: "A simplified reading path designed to turn dense updates into something usable fast.",
    meta: "A lighter node in the same graph",
  },
];

const graphEdges: Array<[string, string]> = [
  ["rates", "central"],
  ["inflation", "central"],
  ["jobs", "central"],
  ["banking", "central"],
  ["ai", "banking"],
  ["trade", "ai"],
  ["beginner", "central"],
];

const nodeMap = new Map(graphNodes.map((node) => [node.id, node]));
const REVEAL_START_DELAY_MS = 220;
const REVEAL_STEP_MS = 140;
const prefersReducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MarketingGraph() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const hasAnimatedRef = useRef(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(prefersReducedMotion ? graphNodes.length : 0);
  const [isArmed, setIsArmed] = useState(prefersReducedMotion);

  const connectedSet = useMemo(() => {
    if (!activeNodeId) return null;
    const connected = new Set<string>([activeNodeId]);
    for (const [fromId, toId] of graphEdges) {
      if (fromId === activeNodeId || toId === activeNodeId) {
        connected.add(fromId);
        connected.add(toId);
      }
    }
    return connected;
  }, [activeNodeId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (prefersReducedMotion) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || hasAnimatedRef.current) return;
        hasAnimatedRef.current = true;
        setIsArmed(true);
        graphNodes.forEach((_, index) => {
          window.setTimeout(() => {
            setVisibleCount((count) => Math.max(count, index + 1));
          }, REVEAL_START_DELAY_MS + index * REVEAL_STEP_MS);
        });
      },
      { threshold: 0.38 },
    );

    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
    }
  }, []);

  const queueClear = () => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
    }
    clearTimerRef.current = window.setTimeout(() => setActiveNodeId(null), 120);
  };

  const clearQueuedLeave = () => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  return (
    <section className="panel panel-pad-lg stack-24">
      <div className="stack-12">
        <div className="metric-badge">Live map</div>
        <div className="stack-12">
          <h2 className="section-title">See how major financial headlines connect.</h2>
          <p className="body-copy max-w-2xl">
            Each node represents the kind of update readers want help understanding. The product turns dense market
            developments into a format beginners can actually follow.
          </p>
        </div>
      </div>

      <div
        ref={stageRef}
        className={`graph-stage graph-stage-marketing${isArmed ? " graph-stage-live" : ""}`}
        onMouseLeave={queueClear}
      >
        <div className="graph-caption stack-12">
          <p className="section-label">Market graph</p>
        </div>

        <svg aria-hidden="true" className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {graphEdges.map(([fromId, toId], index) => {
            const from = nodeMap.get(fromId);
            const to = nodeMap.get(toId);
            const isVisible = visibleCount > index + 1;
            const isConnected = connectedSet ? connectedSet.has(fromId) && connectedSet.has(toId) : false;
            const isDimmed = connectedSet ? !isConnected : false;

            if (!from || !to) {
              return null;
            }

            return (
              <line
                key={`${fromId}-${toId}`}
                className={`graph-line${isVisible ? " graph-line-visible" : ""}${isConnected ? " graph-line-active" : ""}${isDimmed ? " graph-line-dimmed" : ""}`}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
              />
            );
          })}
        </svg>

        {graphNodes.map((node, index) => {
          const isAnchor = node.href.startsWith("#");
          const isVisible = visibleCount > index;
          const isActive = activeNodeId === node.id;
          const isConnected = connectedSet ? connectedSet.has(node.id) : true;

          return (
            <Link
              key={node.id}
              className={`graph-node${isVisible ? " graph-node-visible" : ""}${isActive ? " graph-node-current" : ""}${connectedSet && !isConnected ? " graph-node-dimmed" : ""}`}
              href={node.href}
              scroll={isAnchor}
              style={
                {
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  "--node-x-mobile": `${node.mobileX ?? node.x}%`,
                  "--node-y-mobile": `${node.mobileY ?? node.y}%`,
                  "--node-float-delay": `${index * 180}ms`,
                } as CSSProperties
              }
              onMouseEnter={() => {
                clearQueuedLeave();
                if (isVisible) setActiveNodeId(node.id);
              }}
              onFocus={() => {
                clearQueuedLeave();
                if (isVisible) setActiveNodeId(node.id);
              }}
              onBlur={queueClear}
              onClick={() => {
                if (isVisible) setActiveNodeId(node.id);
              }}
            >
              <span className={`graph-dot${node.muted ? " graph-dot-muted" : ""}`} />
              <span className="graph-label">{node.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
