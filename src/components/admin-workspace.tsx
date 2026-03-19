"use client";

import type { CSSProperties } from "react";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  Folder,
  FolderOpen,
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

type SidebarItem = {
  id: string;
  label: string;
  type: "folder" | "page";
  children?: SidebarItem[];
};

const toolbarIcons = [SquarePen, Upload, PanelLeftOpen, LayoutList];

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

const initialTree: SidebarItem[] = [
  {
    id: "folder-finance",
    type: "folder",
    label: "Finance",
    children: [
      { id: "page-corporate", type: "page", label: "Corporate Finance" },
      { id: "page-models", type: "page", label: "Financial Models" },
      { id: "page-banking", type: "page", label: "Investment Banking" },
    ],
  },
  {
    id: "folder-news",
    type: "folder",
    label: "News",
    children: [
      { id: "page-intel", type: "page", label: "NVIDIA Investing $5bn in Rival Intel" },
      { id: "page-openai", type: "page", label: "NVIDIA And OpenAI Partnership Deal" },
      { id: "page-china", type: "page", label: "China Ban On NVIDIA AI Chips" },
    ],
  },
  {
    id: "folder-university",
    type: "folder",
    label: "University",
    children: [{ id: "page-tech-interview", type: "page", label: "Tech Interview Preparation" }],
  },
];

const nodeMap = new Map(workspaceNodes.map((node) => [node.id, node]));

function addNodeToFolder(nodes: SidebarItem[], folderId: string, newNode: SidebarItem): SidebarItem[] {
  return nodes.map((node) => {
    if (node.type === "folder" && node.id === folderId) {
      return {
        ...node,
        children: [...(node.children ?? []), newNode],
      };
    }

    if (node.type === "folder" && node.children) {
      return {
        ...node,
        children: addNodeToFolder(node.children, folderId, newNode),
      };
    }

    return node;
  });
}

function findFolderById(nodes: SidebarItem[], folderId: string): SidebarItem | undefined {
  for (const node of nodes) {
    if (node.type === "folder" && node.id === folderId) {
      return node;
    }

    if (node.type === "folder" && node.children) {
      const found = findFolderById(node.children, folderId);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function AdminWorkspace() {
  const idRef = useRef(1);
  const [tree, setTree] = useState<SidebarItem[]>(initialTree);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(initialTree.filter((item) => item.type === "folder").map((item) => item.id)),
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string>(initialTree[0]?.id ?? "");

  const selectedFolderLabel = useMemo(() => {
    const selected = findFolderById(tree, selectedFolderId);
    return selected?.label ?? "Root";
  }, [selectedFolderId, tree]);

  const toggleFolder = (folderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const addFolder = (folderId: string) => {
    const nextId = `folder-generated-${idRef.current}`;
    idRef.current += 1;

    setTree((prev) =>
      addNodeToFolder(prev, folderId, {
        id: nextId,
        type: "folder",
        label: `New Folder ${idRef.current - 1}`,
        children: [],
      }),
    );
    setExpandedIds((prev) => new Set(prev).add(folderId).add(nextId));
    setSelectedFolderId(nextId);
  };

  const addPage = (folderId: string) => {
    const nextId = `page-generated-${idRef.current}`;
    idRef.current += 1;

    setTree((prev) =>
      addNodeToFolder(prev, folderId, {
        id: nextId,
        type: "page",
        label: `Untitled Page ${idRef.current - 1}`,
      }),
    );
    setExpandedIds((prev) => new Set(prev).add(folderId));
    setSelectedFolderId(folderId);
  };

  const renderTree = (items: SidebarItem[], depth = 0) => {
    return items.map((item) => {
      const isFolder = item.type === "folder";
      const isExpanded = isFolder ? expandedIds.has(item.id) : false;
      const isSelectedFolder = isFolder && selectedFolderId === item.id;

      return (
        <div key={item.id} className="workspace-tree-group">
          <div className={`workspace-tree-row${isSelectedFolder ? " workspace-tree-row-active" : ""}`}>
            <div className="workspace-tree-item" style={{ paddingLeft: `${0.75 + depth * 0.85}rem` }}>
              {isFolder ? (
                <button
                  aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
                  className="workspace-tree-toggle"
                  onClick={() => toggleFolder(item.id)}
                  type="button"
                >
                  {isExpanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
                </button>
              ) : (
                <span className="workspace-tree-spacer" aria-hidden="true" />
              )}

              <button
                className="workspace-tree-label"
                onClick={() => {
                  if (isFolder) {
                    setSelectedFolderId(item.id);
                  }
                }}
                type="button"
              >
                {isFolder ? (
                  isExpanded ? (
                    <FolderOpen className="workspace-tree-type" size={14} strokeWidth={1.9} />
                  ) : (
                    <Folder className="workspace-tree-type" size={14} strokeWidth={1.9} />
                  )
                ) : (
                  <FileText className="workspace-tree-type" size={14} strokeWidth={1.9} />
                )}
                <span>{item.label}</span>
              </button>
            </div>

            {isFolder ? (
              <div className="workspace-tree-actions">
                <button
                  aria-label="Add page"
                  className="workspace-tree-action"
                  onClick={() => addPage(item.id)}
                  type="button"
                >
                  <FileText size={13} strokeWidth={1.9} />
                </button>
                <button
                  aria-label="Add folder"
                  className="workspace-tree-action"
                  onClick={() => addFolder(item.id)}
                  type="button"
                >
                  <Folder size={13} strokeWidth={1.9} />
                </button>
              </div>
            ) : null}
          </div>

          {isFolder && isExpanded && item.children?.length ? (
            <div className="workspace-nested">{renderTree(item.children, depth + 1)}</div>
          ) : null}
        </div>
      );
    });
  };

  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <div className="workspace-sidebar-peek" aria-hidden="true" />

        <div className="workspace-toolbar">
          <div className="workspace-icon-row">
            {toolbarIcons.map((Icon, index) => (
              <button key={index} aria-label="Workspace action" className="workspace-icon-button" type="button">
                <Icon size={18} strokeWidth={1.8} />
              </button>
            ))}
            <button
              aria-label="Add page to selected folder"
              className="workspace-icon-button"
              onClick={() => addPage(selectedFolderId)}
              type="button"
            >
              <Plus size={18} strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="workspace-sidebar-scroll">
          <div className="workspace-tree-header">
            <p className="workspace-tree-title">Workspace</p>
            <p className="workspace-tree-subtitle">Selected: {selectedFolderLabel}</p>
          </div>

          <div className="workspace-tree">{renderTree(tree)}</div>
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
