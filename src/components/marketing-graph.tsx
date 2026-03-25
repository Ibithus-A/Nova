import Link from "next/link";

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
  },
  {
    id: "ai",
    label: "NVIDIA and AI demand explained",
    href: buildSignInHref("/workspace"),
    x: 78,
    y: 30,
    mobileX: 73,
    mobileY: 36,
  },
  {
    id: "trade",
    label: "China chip restrictions in plain English",
    href: buildSignInHref("/workspace"),
    x: 77,
    y: 68,
    mobileX: 72,
    mobileY: 74,
  },
  {
    id: "inflation",
    label: "Inflation update for beginners",
    href: buildSignInHref("/workspace"),
    x: 26,
    y: 34,
    mobileX: 24,
    mobileY: 34,
  },
  {
    id: "jobs",
    label: "Jobs data without the jargon",
    href: buildSignInHref("/workspace"),
    x: 31,
    y: 66,
    mobileX: 27,
    mobileY: 70,
  },
  {
    id: "central",
    label: "Complex market news, made simple",
    href: "#product-overview",
    x: 52,
    y: 49,
    mobileX: 50,
    mobileY: 52,
  },
  {
    id: "banking",
    label: "Why banking moves markets",
    href: buildSignInHref("/workspace"),
    x: 63,
    y: 38,
    mobileX: 62,
    mobileY: 48,
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

export function MarketingGraph() {
  return (
    <section className="panel panel-pad-lg stack-24" id="live-map">
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

      <div className="graph-stage graph-stage-marketing">
        <div className="graph-caption stack-12">
          <p className="section-label">Market graph</p>
        </div>

        <svg aria-hidden="true" className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
          {graphEdges.map(([fromId, toId]) => {
            const from = nodeMap.get(fromId);
            const to = nodeMap.get(toId);

            if (!from || !to) {
              return null;
            }

            return (
              <line
                key={`${fromId}-${toId}`}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
                stroke="rgba(0, 0, 0, 0.12)"
                strokeWidth="0.22"
              />
            );
          })}
        </svg>

        {graphNodes.map((node) => {
          const isAnchor = node.href.startsWith("#");

          return (
            <Link
              key={node.id}
              className="graph-node"
              href={node.href}
              scroll={isAnchor}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
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
