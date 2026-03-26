"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutList,
  Minus,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Smile,
  SquarePen,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import type { GraphEdge, PageData, SidebarItem, SimNode, Transform } from "@/lib/graph-types";
import { useGraphStore } from "@/lib/graph-store";
import {
  computeDegrees,
  deriveGraphEdges,
  filterEdges,
  forceFromNorm,
  getAllPagesFlat,
  getOrphanIds,
  matchGroup,
} from "@/lib/graph-utils";
import { GraphSettingsPanel } from "./graph-settings-panel";

/* ─────────────────────────── Helpers ───────────────────────── */

function addItem(
  nodes: SidebarItem[],
  parentId: string | null,
  newNode: SidebarItem,
): SidebarItem[] {
  if (parentId === null) return [...nodes, newNode];
  return nodes.map((n) => {
    if (n.id === parentId && n.type === "folder")
      return { ...n, children: [...(n.children ?? []), newNode] };
    if (n.type === "folder" && n.children)
      return { ...n, children: addItem(n.children, parentId, newNode) };
    return n;
  });
}

function removeItem(nodes: SidebarItem[], id: string): SidebarItem[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) =>
      n.type === "folder" && n.children
        ? { ...n, children: removeItem(n.children, id) }
        : n,
    );
}

function renameItemLabel(
  nodes: SidebarItem[],
  id: string,
  label: string,
): SidebarItem[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, label };
    if (n.type === "folder" && n.children)
      return { ...n, children: renameItemLabel(n.children, id, label) };
    return n;
  });
}

function moveItemInto(
  nodes: SidebarItem[],
  dragId: string,
  targetFolderId: string,
): SidebarItem[] {
  let dragged: SidebarItem | null = null;
  function extract(items: SidebarItem[]): SidebarItem[] {
    return items
      .filter((n) => {
        if (n.id === dragId) {
          dragged = n;
          return false;
        }
        return true;
      })
      .map((n) =>
        n.type === "folder" && n.children
          ? { ...n, children: extract(n.children) }
          : n,
      );
  }
  const stripped = extract(nodes);
  if (!dragged) return nodes;
  const item = dragged as SidebarItem;
  function insertInto(items: SidebarItem[]): SidebarItem[] {
    return items.map((n) => {
      if (n.id === targetFolderId && n.type === "folder")
        return { ...n, children: [...(n.children ?? []), item] };
      if (n.type === "folder" && n.children)
        return { ...n, children: insertInto(n.children) };
      return n;
    });
  }
  return insertInto(stripped);
}

function getBreadcrumb(
  nodes: SidebarItem[],
  targetId: string,
  path: string[] = [],
): string[] | null {
  for (const n of nodes) {
    const next = [...path, n.label];
    if (n.id === targetId) return next;
    if (n.type === "folder" && n.children) {
      const found = getBreadcrumb(n.children, targetId, next);
      if (found) return found;
    }
  }
  return null;
}

function trunc(s: string, max = 16): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function estimateNodeSpacing(label: string, nodeSize: number) {
  const clampedLength = Math.min(label.length, 34);
  return Math.max(42, 28 + clampedLength * 3.4) * nodeSize;
}

/* ─────────────────────── Static data ───────────────────────── */

const ALL_TAGS = [
  "Finance",
  "News",
  "Technology",
  "Markets",
  "Policy",
  "University",
  "Career",
];

type SlashCommandItem = {
  id: string;
  label: string;
  description: string;
  kind:
    | "link-page-menu"
    | "page-link"
    | "create-page-link"
    | "heading-1"
    | "heading-2"
    | "heading-3"
    | "table"
    | "toggle"
    | "external-link"
    | "pdf";
  icon: string;
};

const ROOT_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: "link-page",
    label: "Link Page",
    description: "Search an existing page or create a new linked page",
    kind: "link-page-menu",
    icon: "[]",
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Insert a large section heading",
    kind: "heading-1",
    icon: "H1",
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Insert a medium section heading",
    kind: "heading-2",
    icon: "H2",
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Insert a small section heading",
    kind: "heading-3",
    icon: "H3",
  },
  {
    id: "table",
    label: "Table",
    description: "Insert a simple two-column table",
    kind: "table",
    icon: "Tbl",
  },
  {
    id: "toggle",
    label: "Toggle",
    description: "Insert a collapsible toggle block",
    kind: "toggle",
    icon: "Tgl",
  },
  {
    id: "external-link",
    label: "Insert Link",
    description: "Insert an external hyperlink placeholder",
    kind: "external-link",
    icon: "URL",
  },
  {
    id: "pdf",
    label: "Insert PDF",
    description: "Insert a PDF embed placeholder block",
    kind: "pdf",
    icon: "PDF",
  },
];

const PAGE_DRAG_MIME = "application/x-nova-page-link";

const initialTree: SidebarItem[] = [
  {
    id: "folder-finance",
    type: "folder",
    label: "Finance",
    children: [
      { id: "page-corporate", type: "page", label: "Corporate Finance" },
      { id: "page-models", type: "page", label: "Financial Models" },
      { id: "page-banking", type: "page", label: "Investment Banking" },
      { id: "page-methods", type: "page", label: "Financing Methods" },
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
      { id: "page-visa", type: "page", label: "Trump Ban On H1b Visa Impact On India" },
      { id: "page-sentiment", type: "page", label: "Rise Of Sentiment Based Economics" },
    ],
  },
  {
    id: "folder-university",
    type: "folder",
    label: "University",
    children: [
      { id: "page-tech-interview", type: "page", label: "Tech Interview Preparation" },
      { id: "page-finance-interview", type: "page", label: "Finance Interview Preparation" },
      { id: "page-structure", type: "page", label: "Structure And Roles" },
    ],
  },
];

const initialPages: Record<string, PageData> = {
  "page-corporate": {
    title: "Corporate Finance",
    icon: "💼",
    body: "Corporate finance deals with the financial decisions companies make and the tools used to make these decisions. It focuses on maximising shareholder value through financial planning.",
    tags: ["Finance", "Markets"],
    createdAt: new Date("2024-09-01").getTime(),
  },
  "page-models": {
    title: "Financial Models",
    icon: "📊",
    body: "Financial models are tools built in spreadsheet software to forecast a business's financial performance into the future.",
    tags: ["Finance"],
    createdAt: new Date("2024-09-15").getTime(),
  },
  "page-banking": {
    title: "Investment Banking",
    icon: "🏦",
    body: "Investment banking helps organisations raise capital and provides advisory services for mergers, acquisitions, and other complex financial transactions.",
    tags: ["Finance", "Career"],
    createdAt: new Date("2024-10-01").getTime(),
  },
  "page-methods": {
    title: "Financing Methods",
    icon: "💳",
    body: "",
    tags: ["Finance"],
    createdAt: new Date("2024-10-15").getTime(),
  },
  "page-intel": {
    title: "NVIDIA Investing $5bn in Rival Intel",
    icon: "📰",
    body: "",
    tags: ["News", "Technology"],
    createdAt: new Date("2024-11-01").getTime(),
  },
  "page-openai": {
    title: "NVIDIA And OpenAI Partnership Deal",
    icon: "🤝",
    body: "",
    tags: ["News", "Technology"],
    createdAt: new Date("2024-11-10").getTime(),
  },
  "page-china": {
    title: "China Ban On NVIDIA AI Chips",
    icon: "🚫",
    body: "",
    tags: ["News", "Policy"],
    createdAt: new Date("2024-11-20").getTime(),
  },
  "page-visa": {
    title: "Trump Ban On H1b Visa Impact On India",
    icon: "🌐",
    body: "",
    tags: ["News", "Policy"],
    createdAt: new Date("2024-12-01").getTime(),
  },
  "page-sentiment": {
    title: "Rise Of Sentiment Based Economics",
    icon: "📈",
    body: "",
    tags: ["News", "Finance", "Markets"],
    createdAt: new Date("2024-12-15").getTime(),
  },
  "page-tech-interview": {
    title: "Tech Interview Preparation",
    icon: "💻",
    body: "",
    tags: ["University", "Technology", "Career"],
    createdAt: new Date("2025-01-01").getTime(),
  },
  "page-finance-interview": {
    title: "Finance Interview Preparation",
    icon: "📋",
    body: "",
    tags: ["University", "Finance", "Career"],
    createdAt: new Date("2025-01-10").getTime(),
  },
  "page-structure": {
    title: "Structure And Roles",
    icon: "🏢",
    body: "",
    tags: ["University", "Finance"],
    createdAt: new Date("2025-01-20").getTime(),
  },
};

const ARTHUR_RESPONSES = [
  "That's a great question. Based on this page, the key insight is how financial structures interconnect — each decision has downstream effects on capital allocation.",
  "This topic relates closely to market dynamics and corporate strategy. The underlying principle is that informed decisions require understanding both the micro and macro context.",
  "The concepts here are quite foundational. Think of it as a framework: understanding these fundamentals makes complex news much easier to interpret.",
  "Great observation. This connects to broader market trends — sentiment-driven movements often amplify the underlying fundamentals either direction.",
  "The key takeaway from this content is that context matters enormously in finance. Numbers tell a story, but structure tells you how to read it.",
];

const INITIAL_GRAPH_EDGES = deriveGraphEdges(initialTree, initialPages);

/* ─────────────────────────── Constants ─────────────────────── */

const CANVAS_W = 960;
const CANVAS_H = 660;
const MIN_GRAPH_SCALE = 0.6;
const MAX_GRAPH_SCALE = 8;
const GRAPH_ZOOM_PRESETS = [60, 80, 100, 125, 150, 200];

/* ─────────────────────────── Component ─────────────────────── */

export function AdminWorkspace() {
  const idRef = useRef(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const arthurScrollRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const slashSearchRef = useRef<HTMLInputElement>(null);

  /* ── Simulation refs ── */
  const simNodesRef = useRef<SimNode[]>([]);
  const simNodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const alphaRef = useRef(1);
  const rafRef = useRef<number>(0);
  const draggedIdRef = useRef<string | null>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const activeEdgesRef = useRef<GraphEdge[]>([]);
  const focusAnimRef = useRef<number>(0);
  const pagesRef = useRef<Record<string, PageData>>(initialPages);
  const pageHistoryRef = useRef<string[]>([]);
  const pageHistoryIndexRef = useRef(-1);

  /* ── Graph store ── */
  const gStore = useGraphStore();

  /* ── Sidebar state ── */
  const [tree, setTree] = useState<SidebarItem[]>(initialTree);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(initialTree.filter((i) => i.type === "folder").map((i) => i.id)),
  );
  const [pages, setPages] = useState<Record<string, PageData>>(initialPages);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameOriginalValue, setRenameOriginalValue] = useState("");
  const [sidebarDragSrc, setSidebarDragSrc] = useState<string | null>(null);
  const [sidebarDropTarget, setSidebarDropTarget] = useState<string | null>(null);

  /* ── Navigation ── */
  const [view, setView] = useState<"graph" | "page">("graph");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageHistory, setPageHistory] = useState<string[]>([]);
  const [pageHistoryIndex, setPageHistoryIndex] = useState(-1);

  /* ── Graph state ── */
  const [graphHighlightId, setGraphHighlightId] = useState<string | null>(null);
  const [graphSearch, setGraphSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number }>>(() => new Map());
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ── Drag / pan state ── */
  const [dragState, setDragState] = useState<{
    nodeId: string;
    sx: number;
    sy: number;
    snx: number;
    sny: number;
    moved: boolean;
  } | null>(null);
  const [panState, setPanState] = useState<{
    sx: number;
    sy: number;
    stx: number;
    sty: number;
  } | null>(null);

  /* ── Context menu ── */
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  /* ── Arthur AI ── */
  const [arthurMessages, setArthurMessages] = useState<
    { role: "user" | "ai"; text: string }[]
  >([
    {
      role: "ai",
      text: "Hi, I'm Arthur — your workspace assistant. Ask me anything about your notes or the financial topics here.",
    },
  ]);
  const [arthurInput, setArthurInput] = useState("");
  const [arthurTyping, setArthurTyping] = useState(false);

  /* ── Tag editing ── */
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");

  /* ── Slash command menu ── */
  const [slashMenu, setSlashMenu] = useState<{
    top: number;
    left: number;
    query: string;
    mode: "root" | "link-page";
  } | null>(null);
  const [slashCmdIdx, setSlashCmdIdx] = useState(0);
  const [linkPageQuery, setLinkPageQuery] = useState("");
  const [isBodyDropActive, setIsBodyDropActive] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const slashRangeRef = useRef<Range | null>(null);

  /* ─── Derived graph state ─── */

  const allPages = useMemo(() => getAllPagesFlat(tree), [tree]);
  const graphEdges = useMemo(() => deriveGraphEdges(tree, pages), [tree, pages]);

  /* ── Sync transformRef ── */
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  /* ── Sync page data for simulation spacing ── */
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    setPageHistory((prev) => prev.filter((id) => pages[id]));
  }, [pages]);

  useEffect(() => {
    setPageHistoryIndex((prev) => {
      if (pageHistory.length === 0) return -1;
      return Math.min(prev, pageHistory.length - 1);
    });
  }, [pageHistory]);

  useEffect(() => {
    pageHistoryRef.current = pageHistory;
  }, [pageHistory]);

  useEffect(() => {
    pageHistoryIndexRef.current = pageHistoryIndex;
  }, [pageHistoryIndex]);

  /* ── Simulation engine ── */
  const startSim = useCallback(() => {
    cancelAnimationFrame(rafRef.current);

    function tick() {
      const nodes = simNodesRef.current;
      const nodeMap = simNodeMapRef.current;
      const edges = activeEdgesRef.current;
      const alpha = alphaRef.current;
      const pinnedId = draggedIdRef.current;

      alphaRef.current = Math.max(0, alpha * 0.978);

      if (alpha > 0.001) {
        // Read live force settings from Zustand without triggering re-renders
        const { repelForce, linkForce, linkDistance, centerForce, nodeSize } =
          useGraphStore.getState();
        const pageData = pagesRef.current;

        const repelK = forceFromNorm.repel(repelForce);
        const linkK = forceFromNorm.link(linkForce);
        const linkDist = forceFromNorm.distance(linkDistance);
        const centerK = forceFromNorm.center(centerForce);
        // Scale node repulsion slightly with nodeSize
        const repelScale = 0.7 + 0.6 * nodeSize;

        // Repulsion between all pairs
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            const dx = b.x - a.x || 0.01;
            const dy = b.y - a.y || 0.01;
            const dist2 = Math.max(1, dx * dx + dy * dy);
            const dist = Math.sqrt(dist2);
            const labelA = pageData[a.id]?.title ?? "Untitled";
            const labelB = pageData[b.id]?.title ?? "Untitled";
            const minSpacing =
              estimateNodeSpacing(labelA, nodeSize) +
              estimateNodeSpacing(labelB, nodeSize);
            const f = ((repelK * repelScale) / dist2) * alpha;
            const fx = (dx / dist) * f, fy = (dy / dist) * f;
            if (a.id !== pinnedId) { a.vx -= fx; a.vy -= fy; }
            if (b.id !== pinnedId) { b.vx += fx; b.vy += fy; }

            if (dist < minSpacing) {
              const overlap = (minSpacing - dist) / minSpacing;
              const collisionF = overlap * 1.35 * alpha;
              const cfx = (dx / dist) * collisionF;
              const cfy = (dy / dist) * collisionF;
              if (a.id !== pinnedId) { a.vx -= cfx; a.vy -= cfy; }
              if (b.id !== pinnedId) { b.vx += cfx; b.vy += cfy; }
            }
          }
        }

        // Spring forces along edges
        for (const [fromId, toId] of edges) {
          const a = nodeMap.get(fromId), b = nodeMap.get(toId);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (dist - linkDist) * linkK * alpha;
          const fx = (dx / dist) * f, fy = (dy / dist) * f;
          if (a.id !== pinnedId) { a.vx += fx; a.vy += fy; }
          if (b.id !== pinnedId) { b.vx -= fx; b.vy -= fy; }
        }

        // Center gravity
        for (const n of nodes) {
          if (n.id === pinnedId) continue;
          n.vx += (CANVAS_W / 2 - n.x) * centerK * alpha;
          n.vy += (CANVAS_H / 2 - n.y) * centerK * alpha;
          n.vx *= 0.88;
          n.vy *= 0.88;
          n.x += n.vx;
          n.y += n.vy;
        }

        setNodePositions(new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }])));
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  /* ── Reheat sim when force settings change ── */
  useEffect(() => {
    return useGraphStore.subscribe(
      (state, prev) => {
        const forceKeys = [
          "repelForce", "linkForce", "linkDistance", "centerForce", "nodeSize"
        ] as const;
        const changed = forceKeys.some((k) => state[k] !== prev[k]);
        if (changed) {
          alphaRef.current = Math.max(alphaRef.current, 0.35);
        }
      }
    );
  }, []);

  /* ── Rebuild visible nodes when mode/depth/orphans/selection changes ── */
  useEffect(() => {
    if (view !== "graph") return;

    const allPgs = getAllPagesFlat(tree);
    const { showOrphans } = useGraphStore.getState();

    const visibleIds = new Set(allPgs.map((p) => p.id));

    // Hide orphans if configured
    if (!showOrphans) {
      const orphans = getOrphanIds([...visibleIds], graphEdges);
      orphans.forEach((id) => visibleIds.delete(id));
    }

    // Update active edges to only contain visible nodes
    activeEdgesRef.current = filterEdges(graphEdges, visibleIds);

    // Re-initialize simulation nodes preserving existing positions
    const existing = new Map(simNodesRef.current.map((n) => [n.id, n]));
    const newNodes: SimNode[] = [...visibleIds].map((id) => {
      if (existing.has(id)) return existing.get(id)!;
      const angle = Math.random() * Math.PI * 2;
      return {
        id,
        x: CANVAS_W / 2 + 140 * Math.cos(angle),
        y: CANVAS_H / 2 + 140 * Math.sin(angle),
        vx: 0,
        vy: 0,
      };
    });

    simNodesRef.current = newNodes;
    simNodeMapRef.current = new Map(newNodes.map((n) => [n.id, n]));
    alphaRef.current = Math.max(alphaRef.current, 0.6);
  }, [view, tree, graphEdges, gStore.showOrphans]);

  /* ── Initial mount: start sim + center view ── */
  useEffect(() => {
    const allPgs = getAllPagesFlat(initialTree);
    const nodes: SimNode[] = allPgs.map((p, i) => {
      const angle = (i / allPgs.length) * Math.PI * 2;
      const r = Math.min(CANVAS_W, CANVAS_H) * 0.28;
      return {
        id: p.id,
        x: CANVAS_W / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 30,
        y: CANVAS_H / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
      };
    });
    simNodesRef.current = nodes;
    simNodeMapRef.current = new Map(nodes.map((n) => [n.id, n]));
    activeEdgesRef.current = INITIAL_GRAPH_EDGES;
    alphaRef.current = 1;
    startSim();

    const el = canvasRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const t: Transform = {
        x: (rect.width - CANVAS_W) / 2,
        y: (rect.height - CANVAS_H) / 2,
        scale: 1,
      };
      setTransform(t);
      transformRef.current = t;
    }

    return () => cancelAnimationFrame(rafRef.current);
  }, [startSim]);

  /* ── Wheel zoom ── */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || view !== "graph") return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const zoomingOut = e.deltaY > 0;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      const zoomInCenterBias = 0.7;
      const mx = zoomingOut
        ? centerX
        : centerX + (pointerX - centerX) * (1 - zoomInCenterBias);
      const my = zoomingOut
        ? centerY
        : centerY + (pointerY - centerY) * (1 - zoomInCenterBias);
      const factor = zoomingOut ? 1 / 1.1 : 1.1;
      setTransform((prev) => {
        const newScale = Math.max(MIN_GRAPH_SCALE, Math.min(MAX_GRAPH_SCALE, prev.scale * factor));
        const ratio = newScale / prev.scale;
        return {
          x: mx - (mx - prev.x) * ratio,
          y: my - (my - prev.y) * ratio,
          scale: newScale,
        };
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view]);

  /* ── Focus rename input ── */
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  /* ── Auto-scroll Arthur ── */
  useEffect(() => {
    if (arthurScrollRef.current)
      arthurScrollRef.current.scrollTop = arthurScrollRef.current.scrollHeight;
  }, [arthurMessages, arthurTyping]);

  /* ── Focus tag input when menu opens, reset when it closes ── */
  useEffect(() => {
    if (addingTag) {
      setTimeout(() => tagInputRef.current?.focus(), 0);
    } else {
      setTagInput("");
    }
  }, [addingTag]);

  /* ── Sync body innerHTML when switching pages ── */
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = (selectedId && pages[selectedId]?.body) || "";
    }
    setSlashMenu(null);
    setSlashCmdIdx(0);
    setLinkPageQuery("");
    slashRangeRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* ── Close slash menu on outside click ── */
  useEffect(() => {
    if (!slashMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        bodyRef.current &&
        !bodyRef.current.contains(target) &&
        slashMenuRef.current &&
        !slashMenuRef.current.contains(target)
      ) {
        setSlashMenu(null);
        setSlashCmdIdx(0);
        setLinkPageQuery("");
        slashRangeRef.current = null;
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [slashMenu]);

  useEffect(() => {
    if (slashMenu?.mode === "link-page") {
      window.setTimeout(() => slashSearchRef.current?.focus(), 0);
    }
  }, [slashMenu]);

  /* ── Close tag menu on outside click ── */
  useEffect(() => {
    if (!addingTag) return;
    const handler = (e: MouseEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node))
        setAddingTag(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [addingTag]);

  /* ── Close context menu on click outside / Escape ── */
  useEffect(() => {
    if (!contextMenu) return;
    const onDown = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  /* ── Global keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGraphHighlightId(null);
        setContextMenu(null);
        setSettingsOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* ── Smooth focus animation on node highlight ── */
  const smoothFocusNode = useCallback((nodeId: string) => {
    const simNode = simNodeMapRef.current.get(nodeId);
    if (!simNode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const currentT = transformRef.current;
    const targetScale = Math.max(currentT.scale, 1.0);
    const targetX = rect.width / 2 - simNode.x * targetScale;
    const targetY = rect.height / 2 - simNode.y * targetScale;

    const startX = currentT.x;
    const startY = currentT.y;
    const startScale = currentT.scale;
    const startTime = performance.now();
    const duration = 380;

    cancelAnimationFrame(focusAnimRef.current);

    function animate(now: number) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      const newT: Transform = {
        x: startX + (targetX - startX) * ease,
        y: startY + (targetY - startY) * ease,
        scale: startScale + (targetScale - startScale) * ease,
      };
      setTransform(newT);
      transformRef.current = newT;
      if (t < 1) focusAnimRef.current = requestAnimationFrame(animate);
    }

    focusAnimRef.current = requestAnimationFrame(animate);
  }, []);

  const setCenteredScale = useCallback((targetScale: number) => {
    const el = canvasRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    setTransform((prev) => {
      const newScale = Math.max(MIN_GRAPH_SCALE, Math.min(MAX_GRAPH_SCALE, targetScale));
      const ratio = newScale / prev.scale;
      return {
        x: centerX - (centerX - prev.x) * ratio,
        y: centerY - (centerY - prev.y) * ratio,
        scale: newScale,
      };
    });
  }, []);

  const adjustCenteredZoom = useCallback((factor: number) => {
    setCenteredScale(transformRef.current.scale * factor);
  }, [setCenteredScale]);

  // Connected set for highlight effect
  const connectedSet = useMemo(() => {
    if (!graphHighlightId) return null;
    const s = new Set<string>([graphHighlightId]);
    for (const [a, b] of graphEdges) {
      if (a === graphHighlightId) s.add(b);
      if (b === graphHighlightId) s.add(a);
    }
    return s;
  }, [graphEdges, graphHighlightId]);

  // Filter by search + tag
  const filteredIds = useMemo<Set<string> | null>(() => {
    const q = graphSearch.trim().toLowerCase();
    if (!q && !activeTag) return null;
    return new Set(
      allPages
        .filter((p) => {
          const pd = pages[p.id];
          const matchQ =
            !q ||
            (pd?.title ?? p.label).toLowerCase().includes(q) ||
            pd?.tags?.some((t) => t.toLowerCase().includes(q));
          const matchTag = !activeTag || pd?.tags?.includes(activeTag);
          return matchQ && matchTag;
        })
        .map((p) => p.id),
    );
  }, [graphSearch, activeTag, allPages, pages]);

  // Node group color map
  const nodeGroupMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const page of allPages) {
      const group = matchGroup(page.id, pages[page.id], gStore.groups);
      if (group) m.set(page.id, group.color);
    }
    return m;
  }, [allPages, pages, gStore.groups]);

  // Node degree map (for size scaling)
  const degreeMap = useMemo(
    () => computeDegrees(allPages.map((p) => p.id), graphEdges),
    [allPages, graphEdges],
  );

  // Current visible sim node IDs — derived from mutable ref, re-reads each render (cheap O(n))
  const visibleSimIds = new Set(simNodesRef.current.map((n) => n.id));

  // All used tags across all pages
  const usedTags = useMemo(() => {
    const s = new Set<string>();
    for (const pd of Object.values(pages)) pd.tags?.forEach((t) => s.add(t));
    return [...s].sort();
  }, [pages]);

  // Tags available to add: union of seed defaults + all tags created so far
  const availableTags = useMemo(
    () => [...new Set([...ALL_TAGS, ...usedTags])].sort(),
    [usedTags],
  );

  const slashCommands = useMemo<SlashCommandItem[]>(() => {
    if (!slashMenu) {
      return [];
    }

    if (slashMenu.mode === "root") {
      const rootQuery = slashMenu.query.trim().toLowerCase();
      return ROOT_SLASH_COMMANDS.filter((command) => {
        if (!rootQuery) return true;
        return (
          command.label.toLowerCase().includes(rootQuery) ||
          command.description.toLowerCase().includes(rootQuery)
        );
      });
    }

    const rawQuery = linkPageQuery.trim();
    const normalizedQuery = rawQuery.toLowerCase();
    const existingPages = allPages
      .filter((page) => page.id !== selectedId)
      .map((page) => ({
        id: page.id,
        label: pages[page.id]?.title ?? page.label,
      }))
      .filter((page) => !normalizedQuery || page.label.toLowerCase().includes(normalizedQuery))
      .slice(0, 8)
      .map((page) => ({
        id: page.id,
        label: page.label,
        description: "Link to an existing page",
        kind: "page-link" as const,
        icon: "[]",
      }));

    const createOption =
      rawQuery &&
      !allPages.some(
        (page) => (pages[page.id]?.title ?? page.label).toLowerCase() === normalizedQuery,
      )
        ? [
            {
              id: `create:${normalizedQuery}`,
              label: rawQuery,
              description: `Create and link a new page called "${rawQuery}"`,
              kind: "create-page-link" as const,
              icon: "New",
            },
          ]
        : [];

    return [...existingPages, ...createOption];
  }, [allPages, linkPageQuery, pages, selectedId, slashMenu]);

  useEffect(() => {
    if (!slashMenu) return;
    if (slashCommands.length === 0) {
      setSlashMenu(null);
      setSlashCmdIdx(0);
      slashRangeRef.current = null;
      return;
    }

    setSlashCmdIdx((prev) => Math.min(prev, slashCommands.length - 1));
  }, [slashCommands, slashMenu]);

  /* ─── CRUD ─── */

  const createPage = useCallback((title = "Untitled", parentId: string | null = null) => {
    const trimmedTitle = title.trim() || "Untitled";
    const id = `page-gen-${idRef.current++}`;
    setTree((prev) => addItem(prev, parentId, { id, type: "page", label: trimmedTitle }));
    setPages((prev) => ({
      ...prev,
      [id]: { title: trimmedTitle, icon: "", body: "", tags: [], createdAt: Date.now() },
    }));
    const newNode: SimNode = {
      id,
      x: CANVAS_W / 2 + (Math.random() - 0.5) * 120,
      y: CANVAS_H / 2 + (Math.random() - 0.5) * 120,
      vx: 0,
      vy: 0,
    };
    simNodesRef.current = [...simNodesRef.current, newNode];
    simNodeMapRef.current.set(id, newNode);
    alphaRef.current = Math.max(alphaRef.current, 0.5);
    if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId));
    return id;
  }, []);

  const openPage = useCallback((pageId: string, mode: "reset" | "nested" | "replace" = "reset") => {
    setSelectedId(pageId);
    setView("page");

    const currentHistory = pageHistoryRef.current;
    const currentIndex = pageHistoryIndexRef.current;
    const currentSelectedId = selectedId;

    if (mode === "replace") {
      const nextHistory =
        currentIndex < 0
          ? [pageId]
          : currentHistory.map((entry, index) => (index === currentIndex ? pageId : entry));
      const nextIndex = currentIndex < 0 ? 0 : currentIndex;

      pageHistoryRef.current = nextHistory;
      pageHistoryIndexRef.current = nextIndex;
      setPageHistory(nextHistory);
      setPageHistoryIndex(nextIndex);
      return;
    }

    if (mode === "reset") {
      const nextHistory = [pageId];
      pageHistoryRef.current = nextHistory;
      pageHistoryIndexRef.current = 0;
      setPageHistory(nextHistory);
      setPageHistoryIndex(0);
      return;
    }

    const baseHistory =
      currentIndex >= 0 && currentHistory.length > 0
        ? currentHistory.slice(0, currentIndex + 1)
        : currentSelectedId
        ? [currentSelectedId]
        : [];

    if (baseHistory[baseHistory.length - 1] === pageId) {
      pageHistoryRef.current = baseHistory;
      pageHistoryIndexRef.current = Math.max(0, baseHistory.length - 1);
      setPageHistory(baseHistory);
      setPageHistoryIndex(Math.max(0, baseHistory.length - 1));
      return;
    }

    const nextHistory = baseHistory;
    nextHistory.push(pageId);
    const nextIndex = nextHistory.length - 1;

    pageHistoryRef.current = nextHistory;
    pageHistoryIndexRef.current = nextIndex;
    setPageHistory(nextHistory);
    setPageHistoryIndex(nextIndex);
  }, [selectedId]);

  const addPage = useCallback((parentId: string | null = null) => {
    const id = createPage("Untitled", parentId);
    openPage(id, "reset");
  }, [createPage, openPage]);

  const addPageWithTitle = useCallback((title: string, parentId: string | null = null) => {
    return createPage(title, parentId);
  }, [createPage]);

  const navigatePageHistory = useCallback((direction: -1 | 1) => {
    const currentHistory = pageHistoryRef.current;
    const currentIndex = pageHistoryIndexRef.current;
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= currentHistory.length) {
      return;
    }

    const nextPageId = currentHistory[nextIndex];
    if (!nextPageId) {
      return;
    }

    pageHistoryIndexRef.current = nextIndex;
    setPageHistoryIndex(nextIndex);
    setSelectedId(nextPageId);
    setView("page");
  }, []);

  const addFolder = (parentId: string | null = null) => {
    const id = `folder-gen-${idRef.current++}`;
    setTree((prev) =>
      addItem(prev, parentId, { id, type: "folder", label: "New Folder", children: [] }),
    );
    setExpandedIds((prev) => new Set(prev).add(id));
    setRenamingId(id);
    setRenameValue("New Folder");
    setRenameOriginalValue("New Folder");
  };

  const deleteItem = (id: string, type: "folder" | "page") => {
    setTree((prev) => removeItem(prev, id));
    if (type === "page") {
      simNodesRef.current = simNodesRef.current.filter((n) => n.id !== id);
      simNodeMapRef.current.delete(id);
      if (selectedId === id) { setSelectedId(null); setView("graph"); }
      if (graphHighlightId === id) setGraphHighlightId(null);
      if (contextMenu?.nodeId === id) setContextMenu(null);
    } else {
      const folderNode = tree.find((n) => n.id === id);
      const removedPages = getAllPagesFlat(folderNode?.children ?? []);
      for (const p of removedPages) {
        simNodesRef.current = simNodesRef.current.filter((n) => n.id !== p.id);
        simNodeMapRef.current.delete(p.id);
      }
    }
  };

  const commitRename = (id: string, type: "folder" | "page") => {
    const val = renameValue.trim() || (type === "page" ? "Untitled" : "New Folder");
    setTree((prev) => renameItemLabel(prev, id, val));
    if (type === "page")
      setPages((prev) => ({ ...prev, [id]: { ...prev[id], title: val } }));
    setRenamingId(null);
    setRenameOriginalValue("");
  };

  const cancelRename = useCallback((id: string, type: "folder" | "page") => {
    if (type === "page") {
      setPages((prev) => ({ ...prev, [id]: { ...prev[id], title: renameOriginalValue } }));
    }

    setRenameValue(renameOriginalValue);
    setRenamingId(null);
    setRenameOriginalValue("");
  }, [renameOriginalValue]);

  const startRename = useCallback((id: string, label: string) => {
    setRenamingId(id);
    setRenameValue(label);
    setRenameOriginalValue(label);
  }, []);

  const updatePage = useCallback((id: string, patch: Partial<PageData>) => {
    setPages((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const saveCurrentBody = useCallback(() => {
    if (!selectedId || !bodyRef.current) return;
    updatePage(selectedId, { body: bodyRef.current.innerHTML });
  }, [selectedId, updatePage]);

  const closeSlashMenu = useCallback(() => {
    setSlashMenu(null);
    setSlashCmdIdx(0);
    setLinkPageQuery("");
    slashRangeRef.current = null;
  }, []);

  const insertBlockFromSlash = useCallback((html: string) => {
    if (!bodyRef.current || !slashRangeRef.current) return;

    const range = slashRangeRef.current.cloneRange();
    range.deleteContents();
    const fragment = range.createContextualFragment(`${html}<p><br></p>`);
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);

    const selection = window.getSelection();
    if (selection && lastNode) {
      const nextRange = document.createRange();
      nextRange.setStartAfter(lastNode);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }

    closeSlashMenu();
    saveCurrentBody();
    bodyRef.current.focus();
  }, [closeSlashMenu, saveCurrentBody]);

  const insertPageLink = useCallback((pageId: string, label: string, targetRange?: Range) => {
    if (!bodyRef.current) return;

    const range = (targetRange ?? slashRangeRef.current)?.cloneRange();
    if (!range) return;
    range.deleteContents();

    const link = document.createElement("a");
    link.href = "#";
    link.className = "ws-page-link";
    link.dataset.pageId = pageId;
    link.setAttribute("contenteditable", "false");
    link.textContent = label;

    const spacer = document.createTextNode("\u00A0");
    const fragment = document.createDocumentFragment();
    fragment.append(link, spacer);
    range.insertNode(fragment);

    const selection = window.getSelection();
    if (selection) {
      const nextRange = document.createRange();
      nextRange.setStartAfter(spacer);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }

    closeSlashMenu();
    saveCurrentBody();
    bodyRef.current.focus();
  }, [closeSlashMenu, saveCurrentBody]);

  const applySlashCommand = useCallback((command: SlashCommandItem) => {
    if (command.kind === "link-page-menu") {
      setSlashMenu((prev) =>
        prev
          ? {
              ...prev,
              mode: "link-page",
            }
          : prev,
      );
      setLinkPageQuery("");
      setSlashCmdIdx(0);
      return;
    }

    if (command.kind === "page-link" || command.kind === "create-page-link") {
      const pageId =
        command.kind === "create-page-link"
          ? addPageWithTitle(command.label)
          : command.id;
      insertPageLink(pageId, command.label);
      return;
    }

    if (command.kind === "heading-1") {
      insertBlockFromSlash('<h1 class="ws-block-heading ws-block-heading-1">Heading 1</h1>');
      return;
    }

    if (command.kind === "heading-2") {
      insertBlockFromSlash('<h2 class="ws-block-heading ws-block-heading-2">Heading 2</h2>');
      return;
    }

    if (command.kind === "heading-3") {
      insertBlockFromSlash('<h3 class="ws-block-heading ws-block-heading-3">Heading 3</h3>');
      return;
    }

    if (command.kind === "table") {
      insertBlockFromSlash(
        '<table class="ws-block-table"><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Value</td><td>Value</td></tr></tbody></table>',
      );
      return;
    }

    if (command.kind === "toggle") {
      insertBlockFromSlash(
        '<details class="ws-block-toggle"><summary>Toggle</summary><p>Hidden content</p></details>',
      );
      return;
    }

    if (command.kind === "external-link") {
      insertBlockFromSlash(
        '<p><a class="ws-inline-link" href="https://" target="_blank" rel="noreferrer">Paste external link</a></p>',
      );
      return;
    }

    if (command.kind === "pdf") {
      insertBlockFromSlash(
        '<div class="ws-block-embed"><strong>PDF Embed</strong><span>Add your PDF link or upload flow here.</span></div>',
      );
    }
  }, [addPageWithTitle, insertBlockFromSlash, insertPageLink]);

  /* ─── Arthur ─── */

  const sendArthur = () => {
    const txt = arthurInput.trim();
    if (!txt) return;
    setArthurMessages((prev) => [...prev, { role: "user", text: txt }]);
    setArthurInput("");
    setArthurTyping(true);
    setTimeout(() => {
      const ctx =
        selectedId && pages[selectedId]
          ? `Regarding "${trunc(pages[selectedId].title, 30)}" — `
          : "";
      const resp = ARTHUR_RESPONSES[Math.floor(Math.random() * ARTHUR_RESPONSES.length)];
      setArthurMessages((prev) => [...prev, { role: "ai", text: ctx + resp }]);
      setArthurTyping(false);
    }, 700 + Math.random() * 700);
  };

  /* ─── Graph mouse handlers ─── */

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setGraphHighlightId(null);
    setContextMenu(null);
    setPanState({ sx: e.clientX, sy: e.clientY, stx: transform.x, sty: transform.y });
  };

  const handleNodeMouseDown = (
    e: React.MouseEvent<SVGGElement>,
    nodeId: string,
  ) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const pos = nodePositions.get(nodeId);
    if (!pos) return;
    setPanState(null);
    draggedIdRef.current = nodeId;
    setDragState({
      nodeId,
      sx: e.clientX,
      sy: e.clientY,
      snx: pos.x,
      sny: pos.y,
      moved: false,
    });
  };

  const handleNodeContextMenu = (
    e: React.MouseEvent<SVGGElement>,
    nodeId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ nodeId, x: e.clientX, y: e.clientY });
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragState) {
      const dx = e.clientX - dragState.sx;
      const dy = e.clientY - dragState.sy;
      if (!dragState.moved && Math.hypot(dx, dy) < 4) return;
      setDragState((prev) => (prev ? { ...prev, moved: true } : prev));
      const newX = dragState.snx + dx / transformRef.current.scale;
      const newY = dragState.sny + dy / transformRef.current.scale;
      const simNode = simNodeMapRef.current.get(dragState.nodeId);
      if (simNode) { simNode.x = newX; simNode.y = newY; simNode.vx = 0; simNode.vy = 0; }
      setNodePositions((prev) => {
        const next = new Map(prev);
        next.set(dragState.nodeId, { x: newX, y: newY });
        return next;
      });
    } else if (panState) {
      setTransform((prev) => ({
        ...prev,
        x: panState.stx + (e.clientX - panState.sx),
        y: panState.sty + (e.clientY - panState.sy),
      }));
    }
  };

  const handleSvgMouseUp = () => {
    if (dragState) {
      if (!dragState.moved) {
        // Single click → open the page immediately
        openPage(dragState.nodeId);
        setGraphHighlightId(null);
      } else {
        alphaRef.current = Math.max(alphaRef.current, 0.3);
      }
      draggedIdRef.current = null;
      setDragState(null);
    }
    setPanState(null);
  };

  /* ─── Sidebar drag-drop ─── */

  const handleSidebarDragStart = (e: React.DragEvent, id: string) => {
    setSidebarDragSrc(id);
    e.dataTransfer.effectAllowed = "move";
    const draggedPageTitle = pages[id]?.title;
    if (draggedPageTitle) {
      e.dataTransfer.setData(
        PAGE_DRAG_MIME,
        JSON.stringify({ id, title: draggedPageTitle }),
      );
    }
  };

  const updateSlashMenuFromSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !bodyRef.current) {
      setSlashMenu(null);
      setSlashCmdIdx(0);
      slashRangeRef.current = null;
      return;
    }

    const range = selection.getRangeAt(0);
    const anchorNode = selection.anchorNode;

    if (!range.collapsed || !anchorNode || !bodyRef.current.contains(anchorNode)) {
      setSlashMenu(null);
      setSlashCmdIdx(0);
      slashRangeRef.current = null;
      return;
    }

    if (anchorNode.nodeType !== Node.TEXT_NODE) {
      setSlashMenu(null);
      setSlashCmdIdx(0);
      slashRangeRef.current = null;
      return;
    }

    const textNode = anchorNode as Text;
    const textBeforeCaret = textNode.data.slice(0, range.startOffset);
    const slashMatch = textBeforeCaret.match(/(?:^|\s)\/([^/]*)$/);

    if (!slashMatch) {
      setSlashMenu(null);
      setSlashCmdIdx(0);
      slashRangeRef.current = null;
      return;
    }

    const query = slashMatch[1] ?? "";
    const slashOffset = range.startOffset - query.length - 1;
    const slashRange = document.createRange();
    slashRange.setStart(textNode, slashOffset);
    slashRange.setEnd(textNode, range.startOffset);

    const bodyRect = bodyRef.current.getBoundingClientRect();
    const slashRect = range.getBoundingClientRect();

    slashRangeRef.current = slashRange;
    setSlashMenu({
      top: slashRect.bottom - bodyRect.top + 12,
      left: slashRect.left - bodyRect.left,
      query,
      mode: "root",
    });
    setSlashCmdIdx(0);
  }, []);

  const handleBodyInput = useCallback(() => {
    saveCurrentBody();
    updateSlashMenuFromSelection();
  }, [saveCurrentBody, updateSlashMenuFromSelection]);

  const handleBodyKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!slashMenu || slashCommands.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashCmdIdx((prev) => (prev + 1) % slashCommands.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashCmdIdx((prev) => (prev - 1 + slashCommands.length) % slashCommands.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      applySlashCommand(slashCommands[slashCmdIdx] ?? slashCommands[0]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSlashMenu();
    }
  }, [applySlashCommand, closeSlashMenu, slashCmdIdx, slashCommands, slashMenu]);

  const handleSlashSearchKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (slashCommands.length === 0) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlashMenu();
        bodyRef.current?.focus();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSlashCmdIdx((prev) => (prev + 1) % slashCommands.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSlashCmdIdx((prev) => (prev - 1 + slashCommands.length) % slashCommands.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      applySlashCommand(slashCommands[slashCmdIdx] ?? slashCommands[0]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setSlashMenu((prev) =>
        prev
          ? {
              ...prev,
              mode: "root",
              query: "",
            }
          : prev,
      );
      setLinkPageQuery("");
      setSlashCmdIdx(0);
      bodyRef.current?.focus();
    }
  }, [applySlashCommand, closeSlashMenu, slashCmdIdx, slashCommands]);

  const handleBodyClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const link = target.closest<HTMLElement>("[data-page-id]");
    if (!link) {
      return;
    }

    event.preventDefault();
    const pageId = link.dataset.pageId;
    if (!pageId) {
      return;
    }

    saveCurrentBody();
    openPage(pageId, "nested");
  }, [openPage, saveCurrentBody]);

  const getDropRange = useCallback((x: number, y: number) => {
    if (typeof document === "undefined") {
      return null;
    }

    if ("caretRangeFromPoint" in document) {
      const legacyRange = document.caretRangeFromPoint?.(x, y);
      if (legacyRange) {
        return legacyRange;
      }
    }

    if ("caretPositionFromPoint" in document) {
      const position = document.caretPositionFromPoint?.(x, y);
      if (position?.offsetNode) {
        const range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
        return range;
      }
    }

    return null;
  }, []);

  const handleBodyDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(PAGE_DRAG_MIME)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsBodyDropActive(true);
  }, []);

  const handleBodyDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsBodyDropActive(false);
    }
  }, []);

  const handleBodyDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const pagePayload = event.dataTransfer.getData(PAGE_DRAG_MIME);
    if (!pagePayload) {
      return;
    }

    event.preventDefault();
    setIsBodyDropActive(false);

    let parsedPayload: { id?: string; title?: string };
    try {
      parsedPayload = JSON.parse(pagePayload) as { id?: string; title?: string };
    } catch {
      return;
    }

    if (!parsedPayload.id || !parsedPayload.title) {
      return;
    }

    const dropRange = getDropRange(event.clientX, event.clientY);
    insertPageLink(parsedPayload.id, parsedPayload.title, dropRange ?? undefined);
  }, [getDropRange, insertPageLink]);
  const handleSidebarDragOver = (
    e: React.DragEvent,
    id: string,
    type: "folder" | "page",
  ) => {
    if (type !== "folder") return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setSidebarDropTarget(id);
  };
  const handleSidebarDrop = (
    e: React.DragEvent,
    targetId: string,
    type: "folder" | "page",
  ) => {
    e.preventDefault();
    if (!sidebarDragSrc || type !== "folder" || sidebarDragSrc === targetId) return;
    setTree((prev) => moveItemInto(prev, sidebarDragSrc, targetId));
    setExpandedIds((prev) => new Set(prev).add(targetId));
    setSidebarDragSrc(null);
    setSidebarDropTarget(null);
  };
  const handleSidebarDragEnd = () => {
    setSidebarDragSrc(null);
    setSidebarDropTarget(null);
  };

  /* ─── Sidebar tree renderer ─── */

  const renderTree = (items: SidebarItem[], depth = 0): React.ReactNode =>
    items.map((item) => {
      const isFolder = item.type === "folder";
      const isExpanded = isFolder && expandedIds.has(item.id);
      const isSelected = item.id === selectedId && view === "page";
      const isRenaming = item.id === renamingId;
      const isDragOver = item.id === sidebarDropTarget;
      const label = isFolder ? item.label : (pages[item.id]?.title ?? item.label);
      const groupColor = !isFolder ? nodeGroupMap.get(item.id) : undefined;

      return (
        <div key={item.id} className="ws-tree-group">
          <div
            className={`ws-tree-row${isSelected ? " ws-tree-row-active" : ""}${isDragOver ? " ws-tree-row-drop" : ""}`}
            style={{ paddingLeft: `${0.375 + depth * 1.1}rem` }}
            draggable
            onDragStart={(e) => handleSidebarDragStart(e, item.id)}
            onDragOver={(e) => handleSidebarDragOver(e, item.id, item.type)}
            onDrop={(e) => handleSidebarDrop(e, item.id, item.type)}
            onDragEnd={handleSidebarDragEnd}
          >
            <button
              className="ws-tree-expand"
              onClick={() => {
                if (isFolder)
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) { next.delete(item.id); } else { next.add(item.id); }
                    return next;
                  });
              }}
              type="button"
              tabIndex={isFolder ? 0 : -1}
              aria-label={isFolder ? (isExpanded ? "Collapse" : "Expand") : undefined}
            >
              {isFolder ? (
                isExpanded ? (
                  <ChevronDown size={13} strokeWidth={2} />
                ) : (
                  <ChevronRight size={13} strokeWidth={2} />
                )
              ) : (
                <span className="ws-tree-dot" />
              )}
            </button>

            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="ws-rename-input"
                value={renameValue}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setRenameValue(nextValue);
                  if (item.type === "page") {
                    setPages((prev) => ({
                      ...prev,
                      [item.id]: { ...prev[item.id], title: nextValue },
                    }));
                  }
                }}
                onBlur={() => commitRename(item.id, item.type)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(item.id, item.type);
                  if (e.key === "Escape") cancelRename(item.id, item.type);
                }}
                onClick={(e) => e.stopPropagation()}
                aria-label="Rename"
              />
            ) : (
              <button
                className="ws-tree-label-btn"
                onClick={() => {
                  if (isFolder) {
                    setExpandedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(item.id)) { next.delete(item.id); } else { next.add(item.id); }
                      return next;
                    });
                  } else {
                    openPage(item.id);
                  }
                }}
                onDoubleClick={() => {
                  startRename(item.id, label);
                }}
                type="button"
              >
                {isFolder ? (
                  isExpanded ? (
                    <FolderOpen size={14} strokeWidth={1.8} className="ws-tree-icon" />
                  ) : (
                    <Folder size={14} strokeWidth={1.8} className="ws-tree-icon" />
                  )
                ) : (
                  <FileText
                    size={14}
                    strokeWidth={1.8}
                    className="ws-tree-icon"
                    style={groupColor ? { color: groupColor } : undefined}
                  />
                )}
                <span className="ws-tree-label-text">{label}</span>
              </button>
            )}

            <div className="ws-tree-actions">
              {isFolder && (
                <button
                  className="ws-tree-action"
                  onClick={() => addPage(item.id)}
                  title="Add page"
                  type="button"
                  aria-label="Add page"
                >
                  <Plus size={12} strokeWidth={2.2} />
                </button>
              )}
              {isFolder && (
                <button
                  className="ws-tree-action"
                  onClick={() => addFolder(item.id)}
                  title="Add subfolder"
                  type="button"
                  aria-label="Add subfolder"
                >
                  <FolderPlus size={12} strokeWidth={2} />
                </button>
              )}
              <button
                className="ws-tree-action ws-tree-action-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteItem(item.id, item.type);
                }}
                title="Delete"
                type="button"
                aria-label="Delete"
              >
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
          </div>

          {isFolder && isExpanded && item.children?.length ? (
            <div className="ws-tree-children">
              {renderTree(item.children, depth + 1)}
            </div>
          ) : null}
        </div>
      );
    });

  /* ─── Derived render values ─── */

  const breadcrumb = selectedId ? getBreadcrumb(tree, selectedId) : null;
  const selectedPage = selectedId ? pages[selectedId] : null;
  const isGrabbing = !!(dragState?.moved || panState);
  const showArrows = gStore.showArrows;
  const nodeSize = gStore.nodeSize;
  const linkThickness = gStore.linkThickness;
  const textFadeThreshold = gStore.textFadeThreshold;
  const showLabels = transform.scale >= textFadeThreshold;
  const zoomPercent = Math.round(transform.scale * 100);
  const zoomSelectValue = GRAPH_ZOOM_PRESETS.includes(zoomPercent) ? String(zoomPercent) : "custom";

  /* ─── Render ─── */

  return (
    <div className="ws-layout">
      {/* Left sidebar trigger */}
      <div className="ws-sidebar-trigger" aria-hidden="true" />

      {/* Sidebar */}
      <aside className="ws-sidebar" aria-label="Workspace navigation">
        <div className="ws-sidebar-header">
          <div className="ws-sidebar-identity">
            <div className="ws-avatar" aria-hidden="true">I</div>
            <span className="ws-sidebar-workspace-name">Ibrahim&apos;s Workspace</span>
          </div>
        </div>

        <div className="ws-sidebar-toolbar">
          <button
            className="ws-icon-btn"
            title="New page"
            type="button"
            onClick={() => addPage(null)}
            aria-label="New page"
          >
            <SquarePen size={14} strokeWidth={1.8} />
          </button>
          <button
            className="ws-icon-btn"
            title="New folder"
            type="button"
            onClick={() => addFolder(null)}
            aria-label="New folder"
          >
            <Upload size={14} strokeWidth={1.8} />
          </button>
          <button
            className="ws-icon-btn"
            title="Sort"
            type="button"
            aria-label="Sort"
          >
            <LayoutList size={14} strokeWidth={1.8} />
          </button>
          <button
            className={`ws-icon-btn${view === "graph" ? " ws-icon-btn-active" : ""}`}
            title="Graph view"
            type="button"
            onClick={() => setView("graph")}
            aria-pressed={view === "graph"}
            aria-label="Graph view"
          >
            <Share2 size={14} strokeWidth={1.8} />
          </button>
        </div>

        <div className="ws-sidebar-scroll">
          <div className="ws-tree">{renderTree(tree)}</div>
        </div>

        <div className="ws-sidebar-footer">
          <div className="ws-profile">
            <div className="ws-avatar" aria-hidden="true">I</div>
            <div className="ws-profile-meta">
              <p className="ws-profile-name">Ibrahim</p>
              <p className="ws-profile-role">Admin user</p>
            </div>
          </div>
          <div className="ws-profile-actions">
            <button className="ws-icon-btn" aria-label="Help" type="button">
              <CircleHelp size={15} strokeWidth={1.8} />
            </button>
            <button className="ws-icon-btn" aria-label="Settings" type="button">
              <Settings size={15} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="ws-main" id="main-content">
        {/* Topbar */}
        <div className="ws-topbar">
          <div className="ws-topbar-nav">
            <button
              className="ws-icon-btn"
              type="button"
              aria-label="Back"
              onClick={() => navigatePageHistory(-1)}
              disabled={pageHistoryIndex <= 0}
            >
              <ChevronRight
                size={16}
                strokeWidth={2}
                style={{ transform: "rotate(180deg)" }}
              />
            </button>
            <button
              className="ws-icon-btn"
              type="button"
              aria-label="Forward"
              onClick={() => navigatePageHistory(1)}
              disabled={pageHistoryIndex < 0 || pageHistoryIndex >= pageHistory.length - 1}
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
            {view === "page" && (
              <button
                className="ws-icon-btn"
                onClick={() => setView("graph")}
                title="Graph view"
                type="button"
                aria-label="Switch to graph view"
              >
                <Share2 size={15} strokeWidth={1.8} />
              </button>
            )}
          </div>

          <div className="ws-topbar-center">
            {view === "page" && breadcrumb ? (
              <nav className="ws-breadcrumb" aria-label="Breadcrumb">
                {breadcrumb.map((crumb, i) => (
                  <span key={i} className="ws-breadcrumb-item">
                    {i > 0 && (
                      <ChevronRight
                        size={11}
                        strokeWidth={2}
                        className="ws-breadcrumb-sep"
                        aria-hidden
                      />
                    )}
                    <span>{crumb}</span>
                  </span>
                ))}
              </nav>
            ) : null}
          </div>

          <div className="ws-topbar-end">
            {view === "graph" && (
              <button
                className={`ws-icon-btn${settingsOpen ? " ws-icon-btn-active" : ""}`}
                onClick={() => setSettingsOpen((v) => !v)}
                title="Graph settings"
                type="button"
                aria-label="Graph settings"
                aria-expanded={settingsOpen}
              >
                <Settings size={15} strokeWidth={1.8} />
              </button>
            )}
          </div>
        </div>

        {/* ── Graph view ── */}
        {view === "graph" && (
          <div
            className="ws-graph-canvas"
            ref={canvasRef}
            style={{ cursor: isGrabbing ? "grabbing" : "grab" }}
          >
            {/* Search overlay */}
            <div
              className="ws-graph-overlay"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="ws-graph-searchbar">
                <Search
                  size={13}
                  strokeWidth={2}
                  className="ws-graph-search-icon"
                  aria-hidden="true"
                />
                <input
                  className="ws-graph-search-input"
                  placeholder="Search nodes…"
                  value={graphSearch}
                  onChange={(e) => setGraphSearch(e.target.value)}
                  aria-label="Search graph nodes"
                />
                {graphSearch && (
                  <button
                    className="ws-graph-search-clear"
                    onClick={() => setGraphSearch("")}
                    type="button"
                    aria-label="Clear search"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>

            <div
              className="ws-graph-zoom ws-graph-zoom-dock"
              role="group"
              aria-label="Graph zoom controls"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                className="ws-graph-zoom-btn"
                onClick={() => adjustCenteredZoom(1 / 1.1)}
                type="button"
                aria-label="Zoom out"
              >
                <Minus size={13} strokeWidth={2.2} />
              </button>
              <select
                className="ws-graph-zoom-select"
                value={zoomSelectValue}
                onChange={(event) => setCenteredScale(Number(event.target.value) / 100)}
                aria-label="Zoom percentage"
              >
                {!GRAPH_ZOOM_PRESETS.includes(zoomPercent) ? (
                  <option value="custom">{zoomPercent}%</option>
                ) : null}
                {GRAPH_ZOOM_PRESETS.map((preset) => (
                  <option key={preset} value={String(preset)}>
                    {preset}%
                  </option>
                ))}
              </select>
              <button
                className="ws-graph-zoom-btn"
                onClick={() => adjustCenteredZoom(1.1)}
                type="button"
                aria-label="Zoom in"
              >
                <Plus size={13} strokeWidth={2.2} />
              </button>
            </div>

            {/* SVG */}
            <svg
              width="100%"
              height="100%"
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onMouseLeave={handleSvgMouseUp}
              style={{ display: "block" }}
              aria-label="Graph view"
              role="img"
            >
              <defs>
                {showArrows && (
                  <marker
                    id="arrowhead"
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 8 3, 0 6" fill="rgba(0,0,0,0.3)" />
                  </marker>
                )}
              </defs>

              <g
                transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
              >
                {/* Edges */}
                {activeEdgesRef.current.map(([fromId, toId]) => {
                  const from = nodePositions.get(fromId);
                  const to = nodePositions.get(toId);
                  if (!from || !to) return null;

                  const isConn = connectedSet
                    ? connectedSet.has(fromId) && connectedSet.has(toId)
                    : true;
                  const bothFiltered = filteredIds
                    ? filteredIds.has(fromId) && filteredIds.has(toId)
                    : true;
                  const opacity = connectedSet
                    ? isConn
                      ? 0.14
                      : 0.03
                    : filteredIds
                    ? bothFiltered
                      ? 0.5
                      : 0.04
                    : 0.14;

                  const sw = linkThickness;

                  return (
                    <line
                      key={`${fromId}-${toId}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={`rgba(0,0,0,${opacity})`}
                      strokeWidth={sw}
                      markerEnd={showArrows ? "url(#arrowhead)" : undefined}
                    />
                  );
                })}

                {/* Nodes */}
                {allPages.map((page) => {
                  if (!visibleSimIds.has(page.id)) return null;
                  const pos = nodePositions.get(page.id);
                  if (!pos) return null;

                  const isHovered = hoveredNodeId === page.id;
                  const isHighlighted = graphHighlightId === page.id;
                  const isConn = connectedSet ? connectedSet.has(page.id) : true;
                  const isFiltered = filteredIds ? filteredIds.has(page.id) : true;

                  const label = pages[page.id]?.title ?? page.label;
                  const deg = degreeMap.get(page.id) ?? 0;
                  // Degree-scaled radius + nodeSize multiplier
                  const baseR = 4 + Math.sqrt(deg) * 0.8;
                  const r =
                    (isHighlighted ? baseR * 1.8 : isHovered ? baseR * 1.35 : baseR) *
                    nodeSize;

                  const nodeOpacity = connectedSet
                    ? isConn
                      ? 1
                      : 0.07
                    : filteredIds
                    ? isFiltered
                      ? 1
                      : 0.06
                    : 1;

                  const groupColor = nodeGroupMap.get(page.id);
                  const fill = groupColor
                    ? isHighlighted
                      ? "#000"
                      : isHovered
                      ? groupColor
                      : groupColor + "cc"
                    : isHighlighted
                    ? "#000"
                    : isHovered
                    ? "#2c2c2e"
                    : connectedSet && isConn
                    ? "#3a3a3c"
                    : "#636366";
                  return (
                    <g
                      key={page.id}
                      transform={`translate(${pos.x} ${pos.y})`}
                      onMouseDown={(e) => handleNodeMouseDown(e, page.id)}
                      onMouseEnter={() => {
                        setHoveredNodeId(page.id);
                        setGraphHighlightId(page.id);
                      }}
                      onMouseLeave={() => {
                        setHoveredNodeId(null);
                        setGraphHighlightId(null);
                      }}
                      onContextMenu={(e) => handleNodeContextMenu(e, page.id)}
                      style={{
                        cursor: "pointer",
                        opacity: nodeOpacity,
                        outline: "none",
                        transition: "opacity 250ms ease",
                      }}
                      role="button"
                      aria-label={`Node: ${pages[page.id]?.title ?? page.label}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPage(page.id);
                          setGraphHighlightId(null);
                        }
                      }}
                    >
                      {isHighlighted && (
                        <circle
                          r={r + 9}
                          fill="rgba(0,0,0,0.055)"
                          style={{ transition: "r 150ms ease" }}
                        />
                      )}
                      <circle
                        r={r}
                        fill={fill}
                        style={{ transition: "r 150ms ease, fill 150ms ease" }}
                      />
                      {/* Label background + text (hide at low zoom) */}
                      {showLabels && (
                        <>
                          <text
                            x={r + 10}
                            y={2}
                            fontSize={11}
                            fill={
                              isHighlighted ? "#000" : "rgba(0,0,0,0.7)"
                            }
                            fontWeight={isHighlighted ? 600 : 400}
                            stroke="rgba(255,255,255,0.96)"
                            strokeWidth={3.5}
                            paintOrder="stroke fill"
                            strokeLinejoin="round"
                            style={{
                              userSelect: "none",
                              pointerEvents: "none",
                            }}
                          >
                            {label}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* Graph settings panel (inside canvas) */}
            <GraphSettingsPanel
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              activeTag={activeTag}
              availableTags={usedTags}
              onActiveTagChange={setActiveTag}
            />
          </div>
        )}

        {/* ── Page view ── */}
        {view === "page" &&
          (selectedPage ? (
            <div className="ws-page">
              <div className="ws-page-inner">
                <div className="ws-page-icon-row">
                  {selectedPage.icon ? (
                    <button
                      className="ws-page-icon"
                      type="button"
                      aria-label="Change icon"
                    >
                      {selectedPage.icon}
                    </button>
                  ) : (
                    <button
                      className="ws-page-icon-add"
                      onClick={() =>
                        selectedId && updatePage(selectedId, { icon: "📄" })
                      }
                      type="button"
                    >
                      <Smile size={15} strokeWidth={1.8} />
                      <span>Add icon</span>
                    </button>
                  )}
                </div>

                <h1
                  className="ws-page-title"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => {
                    if (selectedId)
                      updatePage(selectedId, {
                        title: e.currentTarget.textContent ?? "Untitled",
                      });
                  }}
                  data-placeholder="Untitled"
                >
                  {selectedPage.title}
                </h1>

                {/* Tags */}
                <div className="ws-page-tags" ref={tagMenuRef}>
                  {selectedPage.tags?.map((tag) => (
                    <span key={tag} className="ws-page-tag-pill">
                      {tag}
                      <button
                        className="ws-page-tag-remove"
                        onClick={() =>
                          selectedId &&
                          updatePage(selectedId, {
                            tags: selectedPage.tags.filter((t) => t !== tag),
                          })
                        }
                        type="button"
                        aria-label={`Remove tag ${tag}`}
                      >
                        <X size={9} strokeWidth={2.5} />
                      </button>
                    </span>
                  ))}
                  <div className="ws-page-tag-add-wrap">
                    <button
                      className="ws-page-tag-add"
                      onClick={() => setAddingTag((v) => !v)}
                      type="button"
                      aria-expanded={addingTag}
                      aria-haspopup="listbox"
                    >
                      <Tag size={10} strokeWidth={2} />
                      <span>Add tag</span>
                    </button>
                    {addingTag && (
                      <div className="ws-page-tag-menu" role="listbox">
                        {/* Search / create input */}
                        <div className="ws-tag-menu-search">
                          <input
                            ref={tagInputRef}
                            className="ws-tag-menu-input"
                            placeholder="Search or create tag…"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && tagInput.trim()) {
                                const t = tagInput.trim();
                                if (selectedId && !selectedPage.tags?.includes(t))
                                  updatePage(selectedId, { tags: [...(selectedPage.tags ?? []), t] });
                                setAddingTag(false);
                              }
                              if (e.key === "Escape") setAddingTag(false);
                            }}
                          />
                        </div>

                        {/* Existing tags filtered by input */}
                        {availableTags
                          .filter((t) => !selectedPage.tags?.includes(t))
                          .filter((t) => !tagInput || t.toLowerCase().includes(tagInput.toLowerCase()))
                          .map((tag) => (
                            <button
                              key={tag}
                              className="ws-page-tag-option"
                              onClick={() => {
                                if (selectedId)
                                  updatePage(selectedId, { tags: [...(selectedPage.tags ?? []), tag] });
                                setAddingTag(false);
                              }}
                              type="button"
                              role="option"
                              aria-selected={false}
                            >
                              {tag}
                            </button>
                          ))}

                        {/* Create new tag if input doesn't match any existing */}
                        {tagInput.trim() &&
                          !availableTags.some(
                            (t) => t.toLowerCase() === tagInput.trim().toLowerCase(),
                          ) && (
                            <button
                              className="ws-page-tag-option ws-page-tag-create"
                              onClick={() => {
                                const t = tagInput.trim();
                                if (selectedId && !selectedPage.tags?.includes(t))
                                  updatePage(selectedId, { tags: [...(selectedPage.tags ?? []), t] });
                                setAddingTag(false);
                              }}
                              type="button"
                              role="option"
                              aria-selected={false}
                            >
                              <Plus size={11} strokeWidth={2.2} />
                              Create &ldquo;{tagInput.trim()}&rdquo;
                            </button>
                          )}

                        {/* Empty state */}
                        {availableTags
                          .filter((t) => !selectedPage.tags?.includes(t))
                          .filter((t) => !tagInput || t.toLowerCase().includes(tagInput.toLowerCase()))
                          .length === 0 &&
                          !tagInput.trim() && (
                            <span className="ws-page-tag-empty">All tags applied</span>
                          )}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  className={`ws-page-body-wrap${isBodyDropActive ? " ws-page-body-wrap-drop" : ""}`}
                >
                  <div
                    ref={bodyRef}
                    className="ws-page-body"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={saveCurrentBody}
                    onClick={handleBodyClick}
                    onDragLeave={handleBodyDragLeave}
                    onDragOver={handleBodyDragOver}
                    onDrop={handleBodyDrop}
                    onInput={handleBodyInput}
                    onKeyDown={handleBodyKeyDown}
                    data-placeholder="Start writing, or press '/' for commands…"
                  />

                  {slashMenu && slashCommands.length > 0 ? (
                    <div
                      ref={slashMenuRef}
                      className="ws-slash-menu"
                      style={{ left: slashMenu.left, top: slashMenu.top }}
                      role="listbox"
                    >
                      {slashMenu.mode === "link-page" ? (
                        <div className="ws-slash-header">
                          <button
                            className="ws-slash-back"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              setSlashMenu((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      mode: "root",
                                      query: "",
                                    }
                                  : prev,
                              );
                              setLinkPageQuery("");
                              setSlashCmdIdx(0);
                              bodyRef.current?.focus();
                            }}
                            type="button"
                          >
                            <ChevronRight
                              size={12}
                              strokeWidth={2}
                              style={{ transform: "rotate(180deg)" }}
                            />
                            Back
                          </button>
                          <span className="ws-slash-header-title">Link Page</span>
                        </div>
                      ) : null}

                      {slashMenu.mode === "link-page" ? (
                        <div className="ws-slash-search">
                          <input
                            ref={slashSearchRef}
                            className="ws-slash-search-input"
                            placeholder="Search pages or type a new page title…"
                            value={linkPageQuery}
                            onChange={(event) => {
                              setLinkPageQuery(event.target.value);
                              setSlashCmdIdx(0);
                            }}
                            onKeyDown={handleSlashSearchKeyDown}
                          />
                        </div>
                      ) : null}

                      {slashCommands.map((command, index) => (
                        <button
                          key={command.id}
                          className={`ws-slash-item${index === slashCmdIdx ? " ws-slash-item-active" : ""}`}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySlashCommand(command);
                          }}
                          type="button"
                          role="option"
                          aria-selected={index === slashCmdIdx}
                        >
                          <span className="ws-slash-item-icon" aria-hidden="true">
                            <span className="ws-slash-item-icon-label">{command.icon}</span>
                          </span>
                          <span className="ws-slash-item-copy">
                            <span className="ws-slash-item-title">{command.label}</span>
                            <span className="ws-slash-item-desc">{command.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="ws-empty-state">
              <p>Select a page to start editing</p>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => addPage(null)}
                type="button"
              >
                <Plus size={14} strokeWidth={2} />
                New page
              </button>
            </div>
          ))}
      </main>

      {view === "page" ? (
        <>
          {/* Right Arthur trigger */}
          <div className="ws-arthur-trigger" aria-hidden="true" />

          {/* Arthur AI Panel */}
          <aside className="ws-arthur" aria-label="Arthur AI assistant">
            <div className="ws-arthur-header">
              <div className="ws-arthur-title">
                <Bot size={15} strokeWidth={1.8} />
                <span>Arthur</span>
              </div>
              <span className="ws-arthur-badge">AI</span>
            </div>

            <div className="ws-arthur-context">
              {selectedId && pages[selectedId] ? (
                <span>
                  Re: <strong>{trunc(pages[selectedId].title, 22)}</strong>
                </span>
              ) : (
                <span>Workspace assistant</span>
              )}
            </div>

            <div
              className="ws-arthur-messages"
              ref={arthurScrollRef}
              aria-live="polite"
              aria-label="Conversation"
            >
              {arthurMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`ws-arthur-msg ws-arthur-msg-${msg.role}`}
                >
                  {msg.role === "ai" && (
                    <div className="ws-arthur-msg-avatar" aria-hidden="true">
                      A
                    </div>
                  )}
                  <div className="ws-arthur-msg-bubble">{msg.text}</div>
                </div>
              ))}
              {arthurTyping && (
                <div className="ws-arthur-msg ws-arthur-msg-ai" aria-label="Arthur is typing">
                  <div className="ws-arthur-msg-avatar" aria-hidden="true">A</div>
                  <div className="ws-arthur-msg-bubble ws-arthur-typing">
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                    <span aria-hidden="true" />
                  </div>
                </div>
              )}
            </div>

            <div className="ws-arthur-input-row">
              <input
                className="ws-arthur-input"
                placeholder="Ask Arthur…"
                value={arthurInput}
                onChange={(e) => setArthurInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendArthur();
                }}
                aria-label="Message Arthur"
              />
              <button
                className="ws-arthur-send"
                onClick={sendArthur}
                disabled={!arthurInput.trim()}
                type="button"
                aria-label="Send message"
              >
                <Send size={13} strokeWidth={2} />
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="ws-ctx-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          aria-label="Node actions"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="ws-ctx-item"
            role="menuitem"
            type="button"
            onClick={() => {
              openPage(contextMenu.nodeId);
              setContextMenu(null);
            }}
          >
            Open page
          </button>
          <button
            className="ws-ctx-item"
            role="menuitem"
            type="button"
            onClick={() => {
              setGraphHighlightId(contextMenu.nodeId);
              smoothFocusNode(contextMenu.nodeId);
              setContextMenu(null);
            }}
          >
            Focus in graph
          </button>
          <button
            className="ws-ctx-item"
            role="menuitem"
            type="button"
            onClick={() => {
              const label =
                pages[contextMenu.nodeId]?.title ??
                getAllPagesFlat(tree).find((p) => p.id === contextMenu.nodeId)?.label ??
                "";
              navigator.clipboard?.writeText(label).catch(() => {});
              setContextMenu(null);
            }}
          >
            Copy title
          </button>
          <button
            className="ws-ctx-item"
            role="menuitem"
            type="button"
            onClick={() => {
              const item = getAllPagesFlat(tree).find(
                (p) => p.id === contextMenu.nodeId,
              );
              if (item) {
                startRename(item.id, pages[item.id]?.title ?? item.label);
                setView("graph");
              }
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <div className="ws-ctx-divider" role="separator" />
          <button
            className="ws-ctx-item ws-ctx-item-danger"
            role="menuitem"
            type="button"
            onClick={() => {
              deleteItem(contextMenu.nodeId, "page");
              setContextMenu(null);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
