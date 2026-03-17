import type { CSSProperties } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  LayoutList,
  PanelLeftOpen,
  Plus,
  Settings,
  SquarePen,
  Upload,
} from "lucide-react";

type WorkspaceNode = {
  id: string;
  label: string;
  href: string;
  x: number;
  y: number;
  mobileX?: number;
  mobileY?: number;
  muted?: boolean;
};

type WorkspaceSection = {
  label: string;
  expanded?: boolean;
  children?: string[];
};

const toolbarIcons = [SquarePen, Plus, Upload, PanelLeftOpen, LayoutList];

const workspaceNodes: WorkspaceNode[] = [
  {
    id: "sentiment",
    label: "Rise Of Sentiment Based Economics",
    href: "#",
    x: 52,
    y: 16,
    mobileX: 50,
    mobileY: 18,
  },
  {
    id: "intel",
    label: "NVIDIA Investing $5bn in Rival Intel (Date -)",
    href: "#",
    x: 32,
    y: 30,
    mobileX: 34,
    mobileY: 34,
  },
  {
    id: "openai",
    label: "NVIDIA And OpenAI Partnership Deal (Date -)",
    href: "#",
    x: 79,
    y: 34,
    mobileX: 72,
    mobileY: 30,
  },
  {
    id: "finance-prep",
    label: "Finance Interview Preparation",
    href: "#",
    x: 43,
    y: 48,
    mobileX: 34,
    mobileY: 48,
  },
  {
    id: "banking",
    label: "Investment Banking",
    href: "#",
    x: 61,
    y: 46,
    mobileX: 58,
    mobileY: 48,
  },
  {
    id: "tech-prep",
    label: "Tech Interview Preparation",
    href: "#",
    x: 27,
    y: 66,
    mobileX: 24,
    mobileY: 66,
  },
  {
    id: "structure",
    label: "Structure And Roles",
    href: "#",
    x: 44,
    y: 76,
    mobileX: 42,
    mobileY: 74,
  },
  {
    id: "visa",
    label: "Trump Ban On H1b Visa Impact On India (Date -)",
    href: "#",
    x: 60,
    y: 79,
    mobileX: 59,
    mobileY: 81,
  },
  {
    id: "models",
    label: "Financial Models",
    href: "#",
    x: 75,
    y: 64,
    mobileX: 77,
    mobileY: 62,
  },
  {
    id: "china",
    label: "China Ban On NVIDIA AI Chips (Date -)",
    href: "#",
    x: 84,
    y: 78,
    mobileX: 84,
    mobileY: 80,
  },
  {
    id: "methods",
    label: "Financing Methods",
    href: "#",
    x: 39,
    y: 94,
    mobileX: 34,
    mobileY: 95,
    muted: true,
  },
  {
    id: "corporate",
    label: "Corporate Finance",
    href: "#",
    x: 64,
    y: 93,
    mobileX: 68,
    mobileY: 94,
  },
];

const workspaceEdges: Array<[string, string]> = [
  ["banking", "structure"],
  ["models", "corporate"],
  ["structure", "corporate"],
  ["methods", "corporate"],
  ["visa", "structure"],
];

const sidebarSections: WorkspaceSection[] = [
  { label: "Applications" },
  { label: "Books" },
  { label: "University" },
  {
    label: "Wider Reading",
    expanded: true,
  },
];

const nestedSections: WorkspaceSection[] = [
  {
    label: "Finance",
    expanded: true,
    children: ["Corporate Finance", "Financial Models", "Investment Banking", "Structure And Roles"],
  },
  {
    label: "News",
    expanded: true,
    children: [
      "China Ban On NVIDIA AI...",
      "NVIDIA And OpenAI Par...",
      "NVIDIA Investing $5bn i...",
      "Rise Of Sentiment Base...",
      "Trump Ban On H1b Visa ...",
    ],
  },
  { label: "Politics" },
];

const nodeMap = new Map(workspaceNodes.map((node) => [node.id, node]));

export function AdminWorkspace() {
  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <div className="workspace-toolbar">
          <div className="workspace-icon-row">
            {toolbarIcons.map((Icon, index) => (
              <button key={index} aria-label="Workspace action" className="workspace-icon-button" type="button">
                <Icon size={18} strokeWidth={1.8} />
              </button>
            ))}
            <button aria-label="More options" className="workspace-icon-button" type="button">
              <ChevronDown size={18} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="workspace-sidebar-scroll">
          <div className="workspace-tree">
            {sidebarSections.map((section) => (
              <div key={section.label} className="workspace-tree-group">
                <div className="workspace-tree-item">
                  {section.expanded ? (
                    <ChevronDown className="workspace-tree-chevron" size={18} strokeWidth={1.7} />
                  ) : (
                    <ChevronRight className="workspace-tree-chevron" size={18} strokeWidth={1.7} />
                  )}
                  <span>{section.label}</span>
                </div>

                {section.expanded ? (
                  <div className="workspace-nested">
                    {nestedSections.map((nested) => (
                      <div key={nested.label} className="workspace-tree-group">
                        <div className="workspace-tree-item">
                          {nested.expanded ? (
                            <ChevronDown className="workspace-tree-chevron" size={18} strokeWidth={1.7} />
                          ) : (
                            <ChevronRight className="workspace-tree-chevron" size={18} strokeWidth={1.7} />
                          )}
                          <span>{nested.label}</span>
                        </div>

                        {nested.children ? (
                          <div className="workspace-tree-children">
                            {nested.children.map((child) => (
                              <div key={child} className="workspace-tree-leaf">
                                {child}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="workspace-profile">
          <div className="workspace-profile-main">
            <div className="workspace-avatar">I</div>
            <div className="workspace-profile-meta">
              <p className="workspace-profile-name">Ibrahim</p>
              <p className="workspace-profile-role">Admin user</p>
            </div>
          </div>
          <div className="workspace-profile-actions">
            <button aria-label="Help" className="workspace-icon-button" type="button">
              <CircleHelp size={18} strokeWidth={1.8} />
            </button>
            <button aria-label="Settings" className="workspace-icon-button" type="button">
              <Settings size={18} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </aside>

      <section className="workspace-main">
        <div className="workspace-toolbar workspace-toolbar-main">
          <div className="workspace-nav">
            <button aria-label="Back" className="workspace-icon-button" type="button">
              <ChevronRight className="rotate-180" size={18} strokeWidth={1.8} />
            </button>
            <button aria-label="Forward" className="workspace-icon-button" type="button">
              <ChevronRight size={18} strokeWidth={1.8} />
            </button>
          </div>
          <p className="workspace-title">Graph view</p>
          <div className="workspace-toolbar-spacer" />
        </div>

        <div className="workspace-graph-shell">
          <div className="graph-stage workspace-graph-stage">
            <svg aria-hidden="true" className="graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
              {workspaceEdges.map(([fromId, toId]) => {
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
                    strokeWidth="0.18"
                  />
                );
              })}
            </svg>

            {workspaceNodes.map((node) => (
              <Link
                key={node.id}
                className="graph-node workspace-node"
                href={node.href}
                style={
                  {
                    "--node-x": `${node.x}%`,
                    "--node-y": `${node.y}%`,
                    "--node-x-mobile": `${node.mobileX ?? node.x}%`,
                    "--node-y-mobile": `${node.mobileY ?? node.y}%`,
                  } as CSSProperties
                }
              >
                <span className={`graph-dot${node.muted ? " graph-dot-muted" : ""}`} />
                <span className="graph-label workspace-label">{node.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
