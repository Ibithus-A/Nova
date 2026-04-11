"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowUpRight,
  Bookmark,
  Bot,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutList,
  Lock,
  Minus,
  Newspaper,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Smile,
  SquarePen,
  Tag,
  TrendingUp,
  Trash2,
  Upload,
  User,
  X,
} from "lucide-react";

import type { Deal, DealStatus, DealType, GraphEdge, PageData, SharedPdf, SidebarItem, SimNode, Transform } from "@/lib/graph-types";
import {
  AUTH_STORAGE_KEY,
  buildSignInHref,
  getAuthSessionSnapshot,
  notifyAuthStateChanged,
  parseLocalAuthSession,
  subscribeToAuthState,
} from "@/lib/auth";
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
import { useRouter } from "next/navigation";

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

function extractItem(
  nodes: SidebarItem[],
  dragId: string,
): { stripped: SidebarItem[]; item: SidebarItem | null } {
  let item: SidebarItem | null = null;
  function walk(items: SidebarItem[]): SidebarItem[] {
    return items
      .filter((n) => {
        if (n.id === dragId) { item = n; return false; }
        return true;
      })
      .map((n) =>
        n.type === "folder" && n.children
          ? { ...n, children: walk(n.children) }
          : n,
      );
  }
  return { stripped: walk(nodes), item };
}

function moveItemInto(
  nodes: SidebarItem[],
  dragId: string,
  targetFolderId: string,
): SidebarItem[] {
  const { stripped, item } = extractItem(nodes, dragId);
  if (!item) return nodes;
  function insertInto(items: SidebarItem[]): SidebarItem[] {
    return items.map((n) => {
      if (n.id === targetFolderId && n.type === "folder")
        return { ...n, children: [...(n.children ?? []), item!] };
      if (n.type === "folder" && n.children)
        return { ...n, children: insertInto(n.children) };
      return n;
    });
  }
  return insertInto(stripped);
}

function moveItemRelative(
  nodes: SidebarItem[],
  dragId: string,
  targetId: string,
  position: "before" | "after",
): SidebarItem[] {
  const { stripped, item } = extractItem(nodes, dragId);
  if (!item) return nodes;
  function insertRelative(items: SidebarItem[]): SidebarItem[] {
    const result: SidebarItem[] = [];
    for (const n of items) {
      if (n.id === targetId) {
        if (position === "before") result.push(item!);
        result.push(n);
        if (position === "after") result.push(item!);
      } else {
        result.push(
          n.type === "folder" && n.children
            ? { ...n, children: insertRelative(n.children) }
            : n,
        );
      }
    }
    return result;
  }
  return insertRelative(stripped);
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

function formatPdfDisplayName(fileName: string) {
  const withoutExtension = fileName.replace(/\.pdf$/i, "");
  const spaced = withoutExtension
    .replace(/[_-]+/g, " ")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (!spaced) {
    return "Untitled Pdf";
  }

  return spaced
    .split(" ")
    .map((word) =>
      /^\d+$/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

function normalizeTagLabel(tag: string) {
  const normalized = tag
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .map((word) =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
}

function normalizeTagList(tags: string[]) {
  const seen = new Set<string>();

  return tags
    .map(normalizeTagLabel)
    .filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDealPageBody(deal: Partial<Deal>) {
  const safeName = escapeHtml(deal.name?.trim() || "Untitled Deal");
  const safeType = escapeHtml(deal.type?.trim() || "Deal");
  const safeStatus = escapeHtml(normalizeTagLabel(deal.status?.trim() || "announced"));
  const safeAmount = escapeHtml(deal.amount?.trim() || "Not set");
  const safeDate = escapeHtml(deal.date?.trim() || "Not set");
  const safeAcquirer = escapeHtml(deal.acquirer?.trim() || "Not set");
  const safeTarget = escapeHtml(deal.target?.trim() || "Not set");
  const safeSector = escapeHtml(deal.sector?.trim() || "Not set");
  const safeAdvisors = escapeHtml(deal.advisors?.trim() || "Not set");

  return `
<h2 class="ws-block-heading ws-block-heading-2">Deal summary</h2>
<p><strong>${safeName}</strong> is being tracked in Nova as a <strong>${safeType}</strong> transaction with current status <strong>${safeStatus}</strong>.</p>
<table class="ws-block-table"><thead><tr><th contenteditable="true">Field</th><th contenteditable="true">Value</th></tr></thead><tbody><tr><td contenteditable="true">Status</td><td contenteditable="true">${safeStatus}</td></tr><tr><td contenteditable="true">Amount</td><td contenteditable="true">${safeAmount}</td></tr><tr><td contenteditable="true">Date</td><td contenteditable="true">${safeDate}</td></tr><tr><td contenteditable="true">Acquirer</td><td contenteditable="true">${safeAcquirer}</td></tr><tr><td contenteditable="true">Target</td><td contenteditable="true">${safeTarget}</td></tr><tr><td contenteditable="true">Sector</td><td contenteditable="true">${safeSector}</td></tr><tr><td contenteditable="true">Advisors</td><td contenteditable="true">${safeAdvisors}</td></tr></tbody></table>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Notes</h2>
<p>Add your detailed deal notes, context, and follow-up work here.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Open questions</h2>
<ul class="ws-block-list">
  <li>What is the core investment or strategic rationale?</li>
  <li>Which approvals, conditions, or execution risks matter most?</li>
  <li>What updates should I watch next?</li>
</ul>
  `.trim();
}

function buildDealPageData(deal: Partial<Deal>, title: string): PageData {
  return {
    title,
    icon: "🤝",
    iconColor: "",
    body: buildDealPageBody(deal),
    tags: normalizeTagList([
      "Deal",
      deal.status ?? "",
      deal.sector ?? "",
    ]),
    createdAt: Date.now(),
  };
}

function estimateNodeSpacing(label: string, nodeSize: number) {
  const clampedLength = Math.min(label.length, 34);
  return Math.max(42, 28 + clampedLength * 3.4) * nodeSize;
}

function syncLinkedPageLabelsInBody(
  body: string,
  targetPageId: string,
  nextTitle: string,
) {
  if (!body || !body.includes(`data-page-id="${targetPageId}"`)) {
    return body;
  }

  const container = document.createElement("div");
  container.innerHTML = body;

  container
    .querySelectorAll<HTMLElement>(`[data-page-id="${targetPageId}"]`)
    .forEach((link) => {
      link.textContent = nextTitle;
    });

  return container.innerHTML;
}

function syncLinkedPageLabelsInPages(
  pages: Record<string, PageData>,
  targetPageId: string,
  nextTitle: string,
) {
  let changed = false;
  const nextPages: Record<string, PageData> = {};

  for (const [pageId, page] of Object.entries(pages)) {
    const nextBody = syncLinkedPageLabelsInBody(page.body, targetPageId, nextTitle);
    if (nextBody !== page.body) {
      changed = true;
      nextPages[pageId] = { ...page, body: nextBody };
    } else {
      nextPages[pageId] = page;
    }
  }

  return changed ? nextPages : pages;
}

/* ─────────────────────── Static data ───────────────────────── */

type SlashCommandItem = {
  id: string;
  label: string;
  description: string;
  kind:
    | "link-page-menu"
    | "page-link"
    | "create-page-link"
    | "text"
    | "heading-1"
    | "heading-2"
    | "heading-3"
    | "bulleted-list"
    | "numbered-list"
    | "todo"
    | "quote"
    | "divider"
    | "toggle"
    | "callout"
    | "code"
    | "table"
    | "external-link"
    | "pdf-pick-menu"
    | "pdf-embed"
    | "ai-write";
  icon: string;
  group?: string;
};

type ArthurMessage = {
  role: "user" | "ai";
  text: string;
  didEdit?: boolean;
};

type ArthurThreadState = {
  messages: ArthurMessage[];
  typing: boolean;
  error: string | null;
  status: string | null;
};

type IconPickerState = {
  pageId: string;
  top: number;
  left: number;
  selectedColor: string;
};


const ROOT_SLASH_COMMANDS: SlashCommandItem[] = [
  /* ── Basic text ── */
  { id: "text",          label: "Text",          description: "Start a plain paragraph",                    kind: "text",          icon: "¶",   group: "Basic" },
  { id: "heading-1",     label: "Heading 1",     description: "Large section heading",                      kind: "heading-1",     icon: "H1",  group: "Basic" },
  { id: "heading-2",     label: "Heading 2",     description: "Medium section heading",                     kind: "heading-2",     icon: "H2",  group: "Basic" },
  { id: "heading-3",     label: "Heading 3",     description: "Small section heading",                      kind: "heading-3",     icon: "H3",  group: "Basic" },
  { id: "bulleted-list", label: "Bulleted List", description: "Simple unordered list",                      kind: "bulleted-list", icon: "•",   group: "Basic" },
  { id: "numbered-list", label: "Numbered List", description: "Ordered numbered list",                      kind: "numbered-list", icon: "1.",  group: "Basic" },
  { id: "todo",          label: "To-do",         description: "Track tasks with checkboxes",                kind: "todo",          icon: "☑",   group: "Basic" },
  { id: "quote",         label: "Quote",         description: "Highlight a quote or key passage",           kind: "quote",         icon: "❝",   group: "Basic" },
  { id: "divider",       label: "Divider",       description: "Horizontal separator between sections",      kind: "divider",       icon: "—",   group: "Basic" },
  /* ── Advanced ── */
  { id: "toggle",        label: "Toggle",        description: "Collapsible section for notes or details",   kind: "toggle",        icon: "▶",   group: "Advanced" },
  { id: "callout",       label: "Callout",       description: "Highlighted note, tip, or warning",          kind: "callout",       icon: "💡",  group: "Advanced" },
  { id: "code",          label: "Code Block",    description: "Monospace block for code or data",           kind: "code",          icon: "</>", group: "Advanced" },
  { id: "table",         label: "Table",         description: "Simple editable table",                      kind: "table",         icon: "⊞",   group: "Advanced" },
  /* ── Insert ── */
  { id: "link-page",     label: "Link Page",     description: "Search or create a linked page",             kind: "link-page-menu", icon: "↗", group: "Insert" },
  { id: "external-link", label: "External Link", description: "Insert a URL hyperlink",                     kind: "external-link", icon: "🔗", group: "Insert" },
  /* ── Media ── */
  { id: "pdf-inline",    label: "PDF Embed",     description: "Embed a PDF from your library",              kind: "pdf-pick-menu", icon: "PDF", group: "Media" },
  /* ── AI ── */
  { id: "ai",            label: "Ask AI",        description: "Ask Arthur to write or edit this page",      kind: "ai-write",      icon: "✦",   group: "AI" },
];

const PAGE_DRAG_MIME = "application/x-nova-page-link";
const DEFAULT_ARTHUR_MESSAGES: ArthurMessage[] = [
  {
    role: "ai",
    text: "Hi, I'm Arthur — your workspace assistant. Ask me anything about this page or the financial topics here.",
  },
];

/* ─────────────────────── Guide templates ───────────────────── */

const G = {
  welcome:   "guide-welcome",
  text:      "guide-text",
  lists:     "guide-lists",
  advanced:  "guide-advanced",
  links:     "guide-links",
  ai:        "guide-ai",
  deals:     "guide-deals",
  graph:     "guide-graph",
};

const initialTree: SidebarItem[] = [
  {
    id: "guide-folder",
    label: "Guide",
    type: "folder",
    children: [
      { id: G.welcome,  label: "Welcome to Nova",          type: "page" },
      { id: G.text,     label: "Text & Formatting",        type: "page" },
      { id: G.lists,    label: "Lists, Tasks & Blocks",    type: "page" },
      { id: G.advanced, label: "Advanced Blocks",          type: "page" },
      { id: G.links,    label: "Page Links & PDFs",        type: "page" },
      { id: G.ai,       label: "Arthur AI Assistant",      type: "page" },
      { id: G.deals,    label: "Deal Tracker",             type: "page" },
      { id: G.graph,    label: "Graph View",               type: "page" },
    ],
  },
];

const initialPages: Record<string, PageData> = {
  [G.welcome]: {
    title: "Welcome to Nova",
    icon: "🚀",
    iconColor: "",
    tags: ["guide", "overview"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">What is Nova?</h2>
<p>Nova is a financial research workspace — a blend of <strong>Notion</strong>, <strong>Obsidian</strong>, and <strong>Substack</strong> built specifically for studying financial news, tracking deals, and building a connected knowledge base.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">What's in this guide?</h2>
<p>Open any page in this <strong>Guide</strong> folder to learn how each feature works. Here's what's covered:</p>
<ul class="ws-block-list">
  <li><strong>Text &amp; Formatting</strong> — Headings, paragraphs, bold, italic</li>
  <li><strong>Lists, Tasks &amp; Blocks</strong> — Bullet lists, numbered lists, to-do checkboxes, quotes, dividers</li>
  <li><strong>Advanced Blocks</strong> — Toggles, callouts, code blocks, tables</li>
  <li><strong>Page Links &amp; PDFs</strong> — Linking pages together, embedding PDFs</li>
  <li><strong>Arthur AI</strong> — Using the AI assistant to ask questions and edit pages</li>
  <li><strong>Deal Tracker</strong> — Tracking M&amp;A, PE, and capital markets deals</li>
  <li><strong>Graph View</strong> — Navigating your connected knowledge graph</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Getting started</h2>
<p>Press <strong>/</strong> anywhere on a page to open the command menu and insert any block type. Hover over any block to reveal the <strong>× delete handle</strong> on the left. Use the sidebar icons to switch between views.</p>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">💡</span><div class="ws-block-callout-body" contenteditable="true"><p>All your notes, deals, and pages are stored in your browser session. Nothing leaves your device unless you choose to export.</p></div></div>
`.trim(),
  },

  [G.text]: {
    title: "Text & Formatting",
    icon: "✍️",
    iconColor: "",
    tags: ["guide", "formatting"],
    createdAt: Date.now(),
    body: `
<h1 class="ws-block-heading ws-block-heading-1">Heading 1 — the largest heading</h1>
<p>Use <strong>Heading 1</strong> for top-level section titles. Type <code>/h1</code> or press <strong>/</strong> and choose Heading 1 from the menu.</p>
<h2 class="ws-block-heading ws-block-heading-2">Heading 2 — medium heading</h2>
<p>Use <strong>Heading 2</strong> for sub-sections. It's the most common heading level for organising a research note.</p>
<h3 class="ws-block-heading ws-block-heading-3">Heading 3 — small heading</h3>
<p>Use <strong>Heading 3</strong> for deeper nesting — for example, within a subsection of a larger analysis.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Paragraphs</h2>
<p>Regular text is written as paragraphs. Just start typing. Press <strong>Enter</strong> to start a new paragraph. You can make text <strong>bold</strong> or <em>italic</em> using your browser's native selection toolbar.</p>
<p>Paragraphs are the backbone of your notes. Write freely, then structure with headings and lists once your thinking is clear.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">How to delete any block</h2>
<p>Hover over any block and a small <strong>×</strong> button will appear on its left edge. Click it to remove the block instantly. This works on every block type — headings, lists, tables, PDFs, toggles, and more.</p>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">⌨️</span><div class="ws-block-callout-body" contenteditable="true"><p>Press <strong>/</strong> at the start of any line to open the block command menu. Type to filter — for example, type <strong>/h2</strong> to jump straight to Heading 2.</p></div></div>
`.trim(),
  },

  [G.lists]: {
    title: "Lists, Tasks & Blocks",
    icon: "📋",
    iconColor: "",
    tags: ["guide", "lists", "tasks"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">Bulleted list</h2>
<p>Use bulleted lists for unordered collections — key risks, analyst names, deal participants.</p>
<ul class="ws-block-list">
  <li>Goldman Sachs acting as lead adviser</li>
  <li>J.P. Morgan providing bridge financing</li>
  <li>Regulatory approval expected Q3 2025</li>
  <li>Synergy target of £180m by year three</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Numbered list</h2>
<p>Use numbered lists when order matters — steps in a process, ranked outcomes, due-diligence checklist.</p>
<ol class="ws-block-list ws-block-list-ordered">
  <li>Read the acquisition announcement and identify the strategic rationale</li>
  <li>Look up the target's last three annual reports</li>
  <li>Find comparable transactions from the past two years</li>
  <li>Build a rough valuation range using EV/EBITDA multiples</li>
</ol>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">To-do list</h2>
<p>Track research tasks with checkboxes. Click the box to mark an item complete.</p>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Read the full merger agreement</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="true" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="true" contenteditable="true">Note the break fee and conditions precedent</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Compare bid premium to sector average</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Check for any competing bidder rumours</span></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Quote block</h2>
<p>Use quotes to highlight a key passage from a report, a CEO statement, or an analyst comment.</p>
<blockquote class="ws-block-quote"><p>"This transaction represents a compelling strategic fit, accelerating our international expansion at an attractive valuation." — CEO, post-announcement call</p></blockquote>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Divider</h2>
<p>A divider creates a clean visual break between sections. Insert one with <strong>/divider</strong>.</p>
<hr class="ws-block-divider" contenteditable="false">
<p>Everything below the divider is a separate section.</p>
`.trim(),
  },

  [G.advanced]: {
    title: "Advanced Blocks",
    icon: "⚡",
    iconColor: "",
    tags: ["guide", "advanced", "blocks"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">Toggle</h2>
<p>Toggles hide content until clicked — great for supplementary detail, raw data, or long analyst commentary you don't want cluttering the main view.</p>
<details class="ws-block-toggle"><summary class="ws-block-toggle-head" contenteditable="true">Click to expand — Deal Background</summary><div class="ws-block-toggle-body" contenteditable="true"><p>The target was founded in 1998 and operates across 14 countries. The acquirer first approached the board in late 2024 but was rebuffed. A revised offer at a 28% premium was accepted following a three-week exclusivity period.</p></div></details>
<details class="ws-block-toggle"><summary class="ws-block-toggle-head" contenteditable="true">Analyst consensus</summary><div class="ws-block-toggle-body" contenteditable="true"><p>12 out of 15 analysts rate the deal as value-accretive within 18 months. Key risks include FX exposure and integration costs higher than guided.</p></div></details>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Callout</h2>
<p>Callouts draw attention to a key insight, warning, or tip. Change the emoji to match the tone.</p>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">⚠️</span><div class="ws-block-callout-body" contenteditable="true"><p><strong>Regulatory risk:</strong> This deal requires sign-off from the EU Competition Commission. Precedent from similar transactions suggests a 4–6 month review.</p></div></div>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">📌</span><div class="ws-block-callout-body" contenteditable="true"><p><strong>Key date:</strong> Shareholder vote scheduled for 14 August 2025. Approval requires a 75% majority.</p></div></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Code block</h2>
<p>Use code blocks for financial models, data snippets, or structured formulas you want to preserve exactly.</p>
<pre class="ws-block-code" contenteditable="true" spellcheck="false">EV / EBITDA multiple (2025E):
  Enterprise Value  = £4,200m
  EBITDA (2025E)    = £310m
  Multiple          = 13.5x

Comparable transactions (last 24 months):
  Peer A  →  11.2x
  Peer B  →  14.8x
  Peer C  →  12.9x
  Mean    →  13.0x  ✓ in-line</pre>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Table</h2>
<p>Tables are best for structured comparisons — deal terms, financial metrics, or a comps sheet.</p>
<table class="ws-block-table"><thead><tr><th contenteditable="true">Metric</th><th contenteditable="true">2023A</th><th contenteditable="true">2024A</th><th contenteditable="true">2025E</th></tr></thead><tbody><tr><td contenteditable="true">Revenue (£m)</td><td contenteditable="true">1,840</td><td contenteditable="true">2,105</td><td contenteditable="true">2,390</td></tr><tr><td contenteditable="true">EBITDA (£m)</td><td contenteditable="true">248</td><td contenteditable="true">289</td><td contenteditable="true">310</td></tr><tr><td contenteditable="true">Margin (%)</td><td contenteditable="true">13.5%</td><td contenteditable="true">13.7%</td><td contenteditable="true">13.0%</td></tr></tbody></table>
`.trim(),
  },

  [G.links]: {
    title: "Page Links & PDFs",
    icon: "🔗",
    iconColor: "",
    tags: ["guide", "links", "pdf"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">Linking pages together</h2>
<p>Nova works like a wiki — every page can link to any other page. This is how you build a connected knowledge base, similar to Obsidian.</p>
<p>To insert a page link, type <strong>/</strong> and choose <strong>Link Page</strong>. Then search for an existing page or type a new page name to create it on the fly. The link will appear inline in your text and clicking it navigates to that page.</p>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">🕸️</span><div class="ws-block-callout-body" contenteditable="true"><p>Every page link you create also appears as an edge in the <strong>Graph View</strong>. The more you link, the richer and more useful your knowledge graph becomes.</p></div></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Embedding PDFs</h2>
<p>You can attach research reports, filings, and prospectuses directly into a page as scrollable inline embeds.</p>
<ol class="ws-block-list ws-block-list-ordered">
  <li>Go to the <strong>Library</strong> tab (file icon in the sidebar) and upload your PDF</li>
  <li>In the Library, click the <strong>+</strong> icon on the PDF card to assign it to one or more pages</li>
  <li>On the page, type <strong>/pdf</strong> and choose the PDF from the list</li>
  <li>The PDF will appear as a scrollable 60vh iframe block in your note</li>
</ol>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">📎</span><div class="ws-block-callout-body" contenteditable="true"><p>PDFs must be assigned to a page before they can be embedded on it. This ensures only relevant documents appear in the insert menu for each page.</p></div></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Page icons & colours</h2>
<p>Every page can have an emoji icon with a coloured background. Click the icon (or the smiley face button) at the top of any page to open the icon picker. Choose an emoji and a background colour to make your pages instantly recognisable in the sidebar.</p>
`.trim(),
  },

  [G.ai]: {
    title: "Arthur AI Assistant",
    icon: "🤖",
    iconColor: "",
    tags: ["guide", "ai", "arthur"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">What is Arthur?</h2>
<p>Arthur is Nova's built-in AI assistant, powered by Cohere. He lives in the right-hand panel (hover over the right edge of the screen or look for the <strong>A</strong> badge). Arthur can see the current page, its tags, and any PDFs assigned to it.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Asking questions</h2>
<p>Arthur reads the current page as his primary source. Ask him anything about the content:</p>
<ul class="ws-block-list">
  <li>"What is the strategic rationale for this deal?"</li>
  <li>"Summarise the key risks mentioned in this note"</li>
  <li>"What does this filing say about the debt structure?"</li>
  <li>"Who are the advisers and what are their roles?"</li>
</ul>
<p>If Arthur can't find the answer in your notes, he'll say so clearly and suggest a useful next step.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Editing the page with Arthur</h2>
<p>Arthur can also write directly to your page. Just ask him to modify the content:</p>
<ul class="ws-block-list">
  <li>"Write a two-paragraph summary of this page"</li>
  <li>"Add a bullet list of the key risks mentioned"</li>
  <li>"Rewrite the introduction to be more concise"</li>
  <li>"Add a heading called Key Takeaways with three points"</li>
</ul>
<p>When Arthur edits the page, a small <strong>Page updated</strong> badge appears on his reply so you always know when the content has changed.</p>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">🔑</span><div class="ws-block-callout-body" contenteditable="true"><p>Arthur requires a <strong>Cohere API key</strong>. Add it as <code>COHERE_API_KEY=your_key</code> in a <code>.env.local</code> file at the project root. A free-tier key is sufficient for most research workloads.</p></div></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Using PDFs with Arthur</h2>
<p>When a PDF is assigned to the current page, Arthur reads its extracted text automatically. This means you can ask Arthur to summarise a 40-page annual report without copying any text yourself — just upload the PDF, assign it to the page, and ask.</p>
`.trim(),
  },

  [G.deals]: {
    title: "Deal Tracker",
    icon: "📈",
    iconColor: "",
    tags: ["guide", "deals", "tracker"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">What is the Deal Tracker?</h2>
<p>The Deal Tracker is Nova's version of a live transaction monitor — inspired by professional platforms like Krugman Insights. Use it to keep track of every M&amp;A deal, IPO, fundraising round, or capital markets transaction you're studying.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Opening the Deal Tracker</h2>
<p>Click the <strong>trending-up (📈) icon</strong> in the sidebar toolbar to switch to the Deal Tracker view. You'll see all your tracked deals as cards.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Adding a deal</h2>
<ol class="ws-block-list ws-block-list-ordered">
  <li>Click <strong>New Deal</strong> in the top-right of the Deal Tracker view</li>
  <li>A card appears and a detail panel opens on the right</li>
  <li>Fill in the deal name, type, status, amount, sector, acquirer, target, and advisers</li>
  <li>Changes save automatically as you type and leave each field</li>
</ol>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Deal fields</h2>
<table class="ws-block-table"><thead><tr><th contenteditable="true">Field</th><th contenteditable="true">Description</th></tr></thead><tbody><tr><td contenteditable="true">Type</td><td contenteditable="true">M&amp;A, LBO, IPO, ECM, DCM, PE, VC, Fundraising, Exit, Other</td></tr><tr><td contenteditable="true">Status</td><td contenteditable="true">Rumored → Announced → Pending → Completed / Terminated</td></tr><tr><td contenteditable="true">Amount</td><td contenteditable="true">Free text — e.g. "$3.9bn" or "£800m"</td></tr><tr><td contenteditable="true">Sector</td><td contenteditable="true">e.g. Healthcare, Technology, Energy</td></tr><tr><td contenteditable="true">Acquirer</td><td contenteditable="true">The buyer or lead firm</td></tr><tr><td contenteditable="true">Target</td><td contenteditable="true">The company being acquired or the issuer</td></tr><tr><td contenteditable="true">Advisors</td><td contenteditable="true">Banks, law firms, consultants involved</td></tr><tr><td contenteditable="true">Linked page</td><td contenteditable="true">Connect the deal to a Nova page with your full notes</td></tr></tbody></table>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Linking deals to pages</h2>
<p>The most powerful feature is the <strong>Linked page</strong> field. Connect any deal to a workspace page where you keep your full research notes, PDFs, and analysis. Then click <strong>Open linked page</strong> to jump straight there from the Deal Tracker.</p>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">💡</span><div class="ws-block-callout-body" contenteditable="true"><p>Create one page per deal for your deep-dive notes, then track the headline data in the Deal Tracker. The link between them keeps everything connected without cluttering either view.</p></div></div>
`.trim(),
  },

  [G.graph]: {
    title: "Graph View",
    icon: "🕸️",
    iconColor: "",
    tags: ["guide", "graph", "navigation"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">What is the Graph View?</h2>
<p>The Graph View shows every page in your workspace as a node, with edges connecting pages that link to each other. It's inspired by Obsidian's graph — a visual map of your knowledge base that reveals clusters, orphans, and connections you might not have noticed.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Navigating the graph</h2>
<ul class="ws-block-list">
  <li><strong>Scroll</strong> to zoom in and out</li>
  <li><strong>Drag the background</strong> to pan around</li>
  <li><strong>Click a node</strong> to highlight it and its connections</li>
  <li><strong>Double-click a node</strong> to open that page</li>
  <li><strong>Right-click a node</strong> for options: open, focus, rename, delete</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Graph settings</h2>
<p>Click the <strong>settings icon</strong> (cog) in the top-right of the graph to adjust:</p>
<ul class="ws-block-list">
  <li><strong>Show orphans</strong> — toggle pages with no links on/off</li>
  <li><strong>Link distance</strong> — how spread out connected nodes are</li>
  <li><strong>Charge strength</strong> — repulsion between all nodes</li>
  <li><strong>Group by tag</strong> — colour-code nodes by their first tag</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Building a useful graph</h2>
<p>The graph becomes most valuable when you consistently use <strong>page links</strong>. A good habit for financial research:</p>
<ol class="ws-block-list ws-block-list-ordered">
  <li>Create a page for each company, deal, or theme you study</li>
  <li>Link related pages whenever you reference them in your notes</li>
  <li>Tag pages by sector (e.g. "healthcare", "technology") to group them visually</li>
  <li>Use the graph to spot which topics you've researched most and where the gaps are</li>
</ol>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">🗺️</span><div class="ws-block-callout-body" contenteditable="true"><p>Highly connected nodes appear larger in the graph. If a company or theme keeps appearing across your research, it will naturally stand out as a hub — helping you see where your attention is focused.</p></div></div>
`.trim(),
  },
};

/* ─────────────────── Template Setup folder ─────────────────── */

const T = {
  pipeline:   "tmpl-pipeline",
  healthcare: "tmpl-healthcare",
  diligence:  "tmpl-diligence",
  meeting:    "tmpl-meeting",
  macro:      "tmpl-macro",
};

initialTree.push({
  id: "tmpl-folder",
  label: "Template Setup",
  type: "folder",
  children: [
    { id: T.pipeline,   label: "M&A Pipeline Overview",       type: "page" },
    { id: T.healthcare, label: "Blackstone / Sigma Healthcare", type: "page" },
    { id: T.diligence,  label: "KKR / Telecom Italia — DD",    type: "page" },
    { id: T.meeting,    label: "Investor Meeting Notes",        type: "page" },
    { id: T.macro,      label: "Macro Backdrop Q2 2025",        type: "page" },
  ],
});

Object.assign(initialPages, {
  [T.pipeline]: {
    title: "M&A Pipeline Overview",
    icon: "🗂️",
    iconColor: "",
    tags: ["pipeline", "Mergers & Acquisitions", "deals"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">Active deal pipeline</h2>
<p>This page tracks every live transaction I'm monitoring. Each deal has a dedicated deep-dive page linked from the Deal Tracker view. Use this page for quick cross-deal observations and pattern recognition.</p>
<table class="ws-block-table"><thead><tr><th contenteditable="true">Deal</th><th contenteditable="true">Type</th><th contenteditable="true">Size</th><th contenteditable="true">Status</th><th contenteditable="true">Key date</th></tr></thead><tbody><tr><td contenteditable="true">Blackstone / Sigma Healthcare</td><td contenteditable="true">PE</td><td contenteditable="true">£3.9bn</td><td contenteditable="true">Announced</td><td contenteditable="true">Q3 2025 close</td></tr><tr><td contenteditable="true">KKR / Telecom Italia NetCo</td><td contenteditable="true">LBO</td><td contenteditable="true">€22bn</td><td contenteditable="true">Pending</td><td contenteditable="true">Reg approval</td></tr><tr><td contenteditable="true">CVC / Opella (Sanofi OTC)</td><td contenteditable="true">M&A</td><td contenteditable="true">€16bn</td><td contenteditable="true">Pending</td><td contenteditable="true">H2 2025</td></tr><tr><td contenteditable="true">Chime Financial IPO</td><td contenteditable="true">IPO</td><td contenteditable="true">$1.5bn</td><td contenteditable="true">Rumored</td><td contenteditable="true">2025 window</td></tr><tr><td contenteditable="true">Brookfield Infra Fund VI</td><td contenteditable="true">Fundraising</td><td contenteditable="true">$25bn</td><td contenteditable="true">Announced</td><td contenteditable="true">Dec 2025</td></tr></tbody></table>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Themes I'm watching</h2>
<ul class="ws-block-list">
  <li>Healthcare consolidation driven by cost-of-care pressures and aging demographics — Blackstone, KKR, and Bain all active</li>
  <li>European telecom infrastructure carve-outs continuing (TI NetCo, Cellnex) as operators deleverage</li>
  <li>Fintech IPO window reopening after 2022–23 freeze — Chime, Klarna, and eToro all watching conditions</li>
  <li>Mega-fundraising in infrastructure and private credit as LPs rotate from public markets</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Completed this quarter</h2>
<ul class="ws-block-list">
  <li>Arm Holdings follow-on offering — $2.1bn priced at $120, 14% above prior close</li>
  <li>ANZ / Suncorp Bank — A$4.9bn, cleared ACCC after 18-month review</li>
  <li>Vista Equity / Jaggaer — $1.1bn LBO, software procurement sector</li>
</ul>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">📌</span><div class="ws-block-callout-body" contenteditable="true"><p>Open the <strong>Deal Tracker</strong> view to see full deal cards with status colours. Link any deal card to a page for your detailed notes.</p></div></div>
`.trim(),
  } satisfies PageData,

  [T.healthcare]: {
    title: "Blackstone / Sigma Healthcare",
    icon: "🏥",
    iconColor: "",
    tags: ["Private Equity", "healthcare", "Blackstone", "announced"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">Transaction summary</h2>
<p>Blackstone is acquiring <strong>Sigma Healthcare</strong>, the Australian pharmacy distribution and retail group, in a take-private valued at approximately <strong>£3.9bn</strong>. The offer represents a 34% premium to the unaffected 60-day VWAP. Board has unanimously recommended shareholders accept.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Strategic rationale</h2>
<ul class="ws-block-list">
  <li>Sigma holds ~28% share of the Australian wholesale pharmaceutical distribution market</li>
  <li>Blackstone sees a platform for consolidation across Asia-Pacific pharmacy retail</li>
  <li>Cost-of-care tailwinds: aging population, expanded dispensing rights for pharmacists</li>
  <li>Take-private removes earnings volatility pressure from public markets during integration</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Deal terms</h2>
<table class="ws-block-table"><thead><tr><th contenteditable="true">Item</th><th contenteditable="true">Detail</th></tr></thead><tbody><tr><td contenteditable="true">Consideration</td><td contenteditable="true">£3.9bn / A$7.5bn enterprise value</td></tr><tr><td contenteditable="true">Premium</td><td contenteditable="true">34% to 60-day VWAP</td></tr><tr><td contenteditable="true">Structure</td><td contenteditable="true">Scheme of arrangement</td></tr><tr><td contenteditable="true">Financing</td><td contenteditable="true">~60% debt (syndicated), ~40% equity from BX Real Estate Partners</td></tr><tr><td contenteditable="true">Advisers (buy-side)</td><td contenteditable="true">Goldman Sachs (M&A), Kirkland &amp; Ellis (legal)</td></tr><tr><td contenteditable="true">Advisers (sell-side)</td><td contenteditable="true">UBS (M&A), Herbert Smith Freehills (legal)</td></tr><tr><td contenteditable="true">Expected close</td><td contenteditable="true">Q3 2025, subject to FIRB &amp; shareholder approval</td></tr></tbody></table>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Key risks</h2>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">⚠️</span><div class="ws-block-callout-body" contenteditable="true"><p><strong>FIRB scrutiny:</strong> Foreign Investment Review Board approval required. Healthcare assets have faced longer reviews recently (see ANZ/Suncorp precedent in financial services).</p></div></div>
<ul class="ws-block-list">
  <li>Regulatory risk: FIRB may impose conditions on supply-chain commitments</li>
  <li>Integration complexity: Sigma operates both wholesale distribution and ~500 retail outlets</li>
  <li>PBS (Pharmaceutical Benefits Scheme) reform risk could compress distributor margins</li>
  <li>Break fee: A$75m payable by Blackstone if deal does not proceed for financing reasons</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">My view</h2>
<p>The premium looks fair but not generous given Sigma's earnings trajectory. Blackstone's track record in healthcare (TeamHealth, Envision) is mixed — both required significant operational restructuring post-close. The platform consolidation thesis is credible but execution risk is high given Sigma's fragmented retail footprint. I'd expect FIRB approval with conditions. Net-net: deal completes, but synergies take 24–36 months to materialise.</p>
`.trim(),
  } satisfies PageData,

  [T.diligence]: {
    title: "KKR / Telecom Italia NetCo — DD",
    icon: "📡",
    iconColor: "",
    tags: ["Leveraged Buyout", "telecom", "KKR", "infrastructure", "pending"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">Overview</h2>
<p>KKR has agreed to acquire <strong>FiberCop</strong> (formerly Telecom Italia NetCo), the fixed-line network infrastructure business carved out of Telecom Italia, in a deal valued at approximately <strong>€22bn</strong>. This is one of the largest European infrastructure LBOs on record.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Structure and financing</h2>
<table class="ws-block-table"><thead><tr><th contenteditable="true">Item</th><th contenteditable="true">Detail</th></tr></thead><tbody><tr><td contenteditable="true">Enterprise value</td><td contenteditable="true">€22bn</td></tr><tr><td contenteditable="true">Debt / equity split</td><td contenteditable="true">~70% / 30% (infrastructure leverage typical)</td></tr><tr><td contenteditable="true">Debt structure</td><td contenteditable="true">Senior secured term loans + infrastructure bonds</td></tr><tr><td contenteditable="true">Buy-side adviser</td><td contenteditable="true">Rothschild, Mediobanca</td></tr><tr><td contenteditable="true">Regulatory bodies</td><td contenteditable="true">EU Commission (DG Comp), AGCOM (Italy), Golden Power review</td></tr></tbody></table>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Due diligence checklist</h2>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="true" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="true" contenteditable="true">Review FiberCop network coverage maps and last-mile fibre rollout plan</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="true" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="true" contenteditable="true">Analyse AGCOM regulated asset base methodology and expected returns</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Model sensitivity: WACC shift ±100bps impact on EV</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Assess Open Access obligations under EU broadband directive</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Check Golden Power precedents — can KKR be forced to divest?</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Read SLA terms for TIM wholesale access agreement (10-year anchor)</span></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Key risk: Italian Golden Power</h2>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">🇮🇹</span><div class="ws-block-callout-body" contenteditable="true"><p>Italy's <strong>Golden Power</strong> law gives the government the right to impose conditions or block foreign acquisitions of strategic infrastructure. Precedent: CDP (state fund) was given a board seat in the Open Fiber deal. Expect KKR to negotiate a similar compromise — likely a government observer seat or cap on foreign board representation.</p></div></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Comparable transactions</h2>
<ul class="ws-block-list">
  <li>Macquarie / Open Reach (UK) — regulatory precedent for open-access infrastructure LBOs</li>
  <li>EQT / Deutsche Glasfaser — German fibre roll-up, €7bn EV, similar wholesale model</li>
  <li>Stonepeak / Zayo — North American fibre, $14.3bn, 2019 (leverage ratio: 6.5x)</li>
</ul>
`.trim(),
  } satisfies PageData,

  [T.meeting]: {
    title: "Investor Meeting Notes",
    icon: "🤝",
    iconColor: "",
    tags: ["notes", "investor", "meeting"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">Meeting — Bridgepoint Capital, 3 April 2025</h2>
<p><strong>Attendees:</strong> Senior Partner (European Buyouts), VP Research, myself</p>
<p><strong>Context:</strong> Follow-up after announcement of Bridgepoint's exit from Burger King France at €900m. Discussed broader European consumer discretionary outlook.</p>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Key points from discussion</h2>
<blockquote class="ws-block-quote"><p>"The consumer recovery in Southern Europe is real but fragile — we're seeing wage growth finally outpacing inflation, but one rate shock could unwind 18 months of progress." — Senior Partner</p></blockquote>
<ul class="ws-block-list">
  <li>Bridgepoint exited BK France at ~9x EBITDA — described as "disciplined, not a home run" given entry at 7.5x in 2019</li>
  <li>Pipeline skewing towards tech-enabled services and healthcare — away from pure consumer</li>
  <li>View on rates: expects ECB to cut twice more in 2025, but financing conditions still restrictive vs. pre-2022</li>
  <li>LBO market comment: "The denominator effect has unwound for most LPs — dry powder is real, but GPs are being patient on entry multiples"</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Follow-up actions</h2>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Request BK France exit memo if available (ask via IR contact)</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Map Bridgepoint's current European portfolio — sectors, vintages, estimated hold periods</span></div>
<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">Pull ECB rate path consensus — build into my macro note</span></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">My takeaways</h2>
<p>Bridgepoint is being unusually candid about exit expectations — the BK France framing as "disciplined" rather than exceptional is refreshing. The pivot away from consumer aligns with what I'm seeing across the deal pipeline. Healthcare and tech-enabled services are absorbing a disproportionate share of European PE capital right now.</p>
<details class="ws-block-toggle"><summary class="ws-block-toggle-head" contenteditable="true">Raw notes (unedited)</summary><div class="ws-block-toggle-body" contenteditable="true"><p>BK France — entered 2019 pre-COVID, store count grew 12% during hold, EBITDA margins expanded 180bps via procurement centralisation. Exit multiple compression vs. entry (7.5x → 9x gross, but net IRR mid-teens after fees and carry). Not transformational. New healthcare platform — three add-on targets identified in Germany and BeNeLux, looking for a GP-led continuation vehicle if LP appetite weak. Macro: ECB cuts priced at 2x, Bridgepoint internal view is 3x possible if Eurozone PMI stays below 50 into Q3.</p></div></details>
`.trim(),
  } satisfies PageData,

  [T.macro]: {
    title: "Macro Backdrop Q2 2025",
    icon: "🌍",
    iconColor: "",
    tags: ["macro", "rates", "research"],
    createdAt: Date.now(),
    body: `
<h2 class="ws-block-heading ws-block-heading-2">The rate environment</h2>
<p>As of Q2 2025, both the Fed and ECB are in easing mode — but the pace is slower than the market anticipated at the start of the year. Sticky services inflation and a resilient US labour market have pushed the first Fed cut out to September. The ECB has cut twice (25bps each) with a third cut expected in June.</p>
<table class="ws-block-table"><thead><tr><th contenteditable="true">Central bank</th><th contenteditable="true">Current rate</th><th contenteditable="true">2025 cuts priced</th><th contenteditable="true">My view</th></tr></thead><tbody><tr><td contenteditable="true">Federal Reserve</td><td contenteditable="true">5.25%</td><td contenteditable="true">2 × 25bps</td><td contenteditable="true">1–2 cuts, data-dependent</td></tr><tr><td contenteditable="true">ECB</td><td contenteditable="true">3.50%</td><td contenteditable="true">3 × 25bps</td><td contenteditable="true">3 cuts base case</td></tr><tr><td contenteditable="true">Bank of England</td><td contenteditable="true">4.75%</td><td contenteditable="true">2 × 25bps</td><td contenteditable="true">2 cuts, wage watch</td></tr></tbody></table>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Impact on deal activity</h2>
<ul class="ws-block-list">
  <li><strong>LBOs:</strong> Still constrained — 10-year rates above 4% in the US keep leverage costs elevated. Sponsors writing smaller equity cheques and being selective on entry multiples</li>
  <li><strong>M&A:</strong> Strategic deal activity recovering — corporates using stock as currency where possible</li>
  <li><strong>IPO market:</strong> Window open for quality assets with clear earnings path (ARM follow-on, Chime watching)</li>
  <li><strong>Infrastructure:</strong> Strongest asset class — long-duration cash flows re-rated well vs. bonds; Brookfield, KKR, Macquarie all raising mega-funds</li>
</ul>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">Key risks to watch</h2>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">🔴</span><div class="ws-block-callout-body" contenteditable="true"><p><strong>Re-acceleration risk:</strong> US CPI ex-shelter still running above 3%. If June print comes in hot, September cut is off the table and credit spreads widen. Watch: HY spreads, leveraged loan repricing activity, and any covenant waivers in sponsor portfolios.</p></div></div>
<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">🟡</span><div class="ws-block-callout-body" contenteditable="true"><p><strong>Geopolitical tail:</strong> Middle East supply routes and European energy prices remain a wildcard. A Brent spike above $95 would reignite inflation in import-dependent economies (Italy, Japan). Monitor: Brent, TTF gas, MENA news flow.</p></div></div>
<hr class="ws-block-divider" contenteditable="false">
<h2 class="ws-block-heading ws-block-heading-2">How this changes my research focus</h2>
<p>In a higher-for-longer environment, I'm spending more time on <strong>asset-heavy, inflation-linked deals</strong> (infrastructure, real estate, healthcare) where cash flows are protected or enhanced by price levels. Pure software LBOs and growth equity are harder to underwrite when the risk-free rate is above 4%.</p>
<pre class="ws-block-code" contenteditable="true" spellcheck="false">Quick sanity check — infrastructure LBO IRR:
  Entry EV/EBITDA:    22x (FiberCop-like)
  Exit EV/EBITDA:     20x (multiple compression)
  Leverage:           6.5x entry EBITDA
  Hold period:        5 years
  Revenue CAGR:       4% (regulated, inflation-linked)
  Gross IRR:          ~14%  ✓ clears hurdle
  Net IRR (2% mgmt):  ~12%  ✓ LP-acceptable</pre>
`.trim(),
  } satisfies PageData,
} satisfies Record<string, PageData>);

/* ─────────────────────────── Initial deals ─────────────────────────── */

const initialDeals: Record<string, Deal> = {
  "deal-bx-sigma": {
    id: "deal-bx-sigma",
    name: "Blackstone / Sigma Healthcare",
    type: "Private Equity",
    amount: "£3.9bn",
    status: "announced",
    acquirer: "Blackstone",
    target: "Sigma Healthcare",
    sector: "Healthcare",
    advisors: "Goldman Sachs, UBS, Kirkland & Ellis",
    date: "2025-02-14",
    linkedPageId: T.healthcare,
    createdAt: Date.now() - 86400000 * 50,
  },
  "deal-kkr-tim": {
    id: "deal-kkr-tim",
    name: "KKR / Telecom Italia NetCo",
    type: "Leveraged Buyout",
    amount: "€22bn",
    status: "pending",
    acquirer: "KKR",
    target: "FiberCop (TI NetCo)",
    sector: "Telecoms Infrastructure",
    advisors: "Rothschild, Mediobanca",
    date: "2024-11-05",
    linkedPageId: T.diligence,
    createdAt: Date.now() - 86400000 * 150,
  },
  "deal-arm-fpo": {
    id: "deal-arm-fpo",
    name: "Arm Holdings Follow-on Offering",
    type: "Equity Capital Markets",
    amount: "$2.1bn",
    status: "completed",
    acquirer: "",
    target: "Arm Holdings",
    sector: "Semiconductors",
    advisors: "Barclays, Goldman Sachs, J.P. Morgan",
    date: "2025-01-22",
    createdAt: Date.now() - 86400000 * 74,
  },
  "deal-anz-suncorp": {
    id: "deal-anz-suncorp",
    name: "ANZ / Suncorp Bank",
    type: "Mergers & Acquisitions",
    amount: "A$4.9bn",
    status: "completed",
    acquirer: "ANZ Banking Group",
    target: "Suncorp Bank",
    sector: "Financial Services",
    advisors: "Flagstaff Partners, King & Wood Mallesons",
    date: "2024-07-31",
    createdAt: Date.now() - 86400000 * 250,
  },
  "deal-bp-bkf": {
    id: "deal-bp-bkf",
    name: "Bridgepoint / Burger King France Exit",
    type: "Exit",
    amount: "€900m",
    status: "announced",
    acquirer: "Undisclosed strategic",
    target: "Burger King France",
    sector: "Consumer / QSR",
    advisors: "Lazard, Freshfields",
    date: "2025-03-18",
    createdAt: Date.now() - 86400000 * 20,
  },
  "deal-cvc-opella": {
    id: "deal-cvc-opella",
    name: "CVC / Opella (Sanofi OTC)",
    type: "Mergers & Acquisitions",
    amount: "€16bn",
    status: "pending",
    acquirer: "CVC Capital Partners",
    target: "Opella (Sanofi Consumer Health)",
    sector: "Consumer Healthcare",
    advisors: "J.P. Morgan, Skadden",
    date: "2024-10-11",
    createdAt: Date.now() - 86400000 * 176,
  },
  "deal-vista-jaggaer": {
    id: "deal-vista-jaggaer",
    name: "Vista Equity / Jaggaer",
    type: "Leveraged Buyout",
    amount: "$1.1bn",
    status: "completed",
    acquirer: "Vista Equity Partners",
    target: "Jaggaer",
    sector: "Enterprise Software",
    advisors: "William Blair, Kirkland & Ellis",
    date: "2024-12-03",
    createdAt: Date.now() - 86400000 * 125,
  },
  "deal-chime-ipo": {
    id: "deal-chime-ipo",
    name: "Chime Financial IPO",
    type: "Initial Public Offering",
    amount: "$1.5bn",
    status: "rumored",
    acquirer: "",
    target: "Chime Financial",
    sector: "Fintech",
    advisors: "Goldman Sachs, Morgan Stanley (expected)",
    date: "",
    createdAt: Date.now() - 86400000 * 10,
  },
  "deal-brookfield-infra6": {
    id: "deal-brookfield-infra6",
    name: "Brookfield Infrastructure Fund VI",
    type: "Fundraising",
    amount: "$25bn",
    status: "announced",
    acquirer: "Brookfield Asset Management",
    target: "",
    sector: "Infrastructure",
    advisors: "",
    date: "2025-01-08",
    createdAt: Date.now() - 86400000 * 88,
  },
  "deal-eqt-dechra": {
    id: "deal-eqt-dechra",
    name: "EQT / Dechra Pharmaceuticals",
    type: "Private Equity",
    amount: "£4.46bn",
    status: "terminated",
    acquirer: "EQT",
    target: "Dechra Pharmaceuticals",
    sector: "Veterinary Pharma",
    advisors: "Rothschild, Linklaters",
    date: "2023-05-15",
    createdAt: Date.now() - 86400000 * 400,
  },
};

const normalizedInitialPages: Record<string, PageData> = Object.fromEntries(
  Object.entries(initialPages).map(([id, page]) => [
    id,
    {
      ...page,
      tags: normalizeTagList(page.tags ?? []),
    },
  ]),
);

const INITIAL_GRAPH_EDGES = deriveGraphEdges(initialTree, normalizedInitialPages);

function createArthurThread(): ArthurThreadState {
  return {
    messages: DEFAULT_ARTHUR_MESSAGES.map((message) => ({ ...message })),
    typing: false,
    error: null,
    status: null,
  };
}

/* ─────────────────────────── Constants ─────────────────────── */

const CANVAS_W = 960;
const CANVAS_H = 660;
const MIN_GRAPH_SCALE = 0.6;
const MAX_GRAPH_SCALE = 8;
const GRAPH_ZOOM_PRESETS = [60, 80, 100, 125, 150, 200];

/* ── Simulation physics ── */
/** Energy multiplier per tick — controls how quickly the simulation cools */
const SIM_ALPHA_DECAY = 0.978;
/** Velocity damping applied each tick */
const SIM_VELOCITY_DAMPING = 0.88;
/** Force multiplier applied when nodes overlap */
const SIM_COLLISION_FORCE = 1.35;
/** Repel base coefficient relative to nodeSize */
const SIM_REPEL_SIZE_BASE = 0.7;
/** Repel scale coefficient relative to nodeSize */
const SIM_REPEL_SIZE_SCALE = 0.6;

/* ── Initial node placement ── */
/** Fraction of the smaller canvas dimension used as the initial ring radius */
const INITIAL_RING_RADIUS_RATIO = 0.28;
/** Random position jitter applied to each node on initial mount */
const INITIAL_NODE_JITTER = 30;
/** Radius of the ring used when spawning nodes added via tree changes */
const SIM_NEW_NODE_RING_RADIUS = 140;
/** Half-spread used when spawning a newly created page node */
const SIM_CREATED_NODE_SPREAD = 120;

/* ── Animation ── */
/** Duration in ms for the smooth camera-focus animation */
const FOCUS_ANIMATION_MS = 380;

/* ─────────────────────────── Icon Picker Data ──────────────── */

const ICON_COLORS: Array<{ label: string; value: string; bg: string }> = [
  { label: "Default", value: "", bg: "" },
  { label: "Red",    value: "red",    bg: "#FDDEDE" },
  { label: "Orange", value: "orange", bg: "#FDE8D1" },
  { label: "Yellow", value: "yellow", bg: "#FDF5CF" },
  { label: "Green",  value: "green",  bg: "#D6F5E0" },
  { label: "Blue",   value: "blue",   bg: "#D4ECFD" },
  { label: "Purple", value: "purple", bg: "#EAD6FD" },
  { label: "Pink",   value: "pink",   bg: "#FDD6EF" },
  { label: "Gray",   value: "gray",   bg: "#EBEBEB" },
];

type PickerEmoji = { emoji: string; label: string };

const PICKER_EMOJI_CATEGORIES: Array<{ cat: string; items: PickerEmoji[] }> = [
  {
    cat: "People",
    items: [
      { emoji: "😀", label: "smile grin happy" },
      { emoji: "😊", label: "smile happy warm" },
      { emoji: "😄", label: "laugh happy joy" },
      { emoji: "😎", label: "cool sunglasses" },
      { emoji: "🥳", label: "party celebrate" },
      { emoji: "🤔", label: "think hmm" },
      { emoji: "😍", label: "love heart eyes" },
      { emoji: "🤩", label: "star eyes wow" },
      { emoji: "🧐", label: "monocle curious" },
      { emoji: "💪", label: "strong muscle flex" },
      { emoji: "👋", label: "wave hello hi" },
      { emoji: "👍", label: "thumbs up ok good" },
      { emoji: "🙏", label: "pray thanks please" },
      { emoji: "🙌", label: "celebrate praise hands" },
      { emoji: "🤝", label: "handshake deal agree" },
      { emoji: "🫶", label: "love heart hands care" },
    ],
  },
  {
    cat: "Nature",
    items: [
      { emoji: "🌟", label: "star glowing gold" },
      { emoji: "⭐", label: "star yellow gold" },
      { emoji: "✨", label: "sparkle shine glitter" },
      { emoji: "💫", label: "dizzy star spin" },
      { emoji: "🌈", label: "rainbow colors arc" },
      { emoji: "🌙", label: "moon night crescent" },
      { emoji: "☀️", label: "sun sunny day" },
      { emoji: "⛅", label: "cloud sun partly" },
      { emoji: "🌊", label: "wave ocean sea water" },
      { emoji: "🔥", label: "fire hot flame" },
      { emoji: "💧", label: "water drop blue" },
      { emoji: "❄️", label: "snow ice cold" },
      { emoji: "🌱", label: "plant seedling grow green" },
      { emoji: "🌿", label: "leaf herb nature" },
      { emoji: "🍀", label: "clover luck green" },
      { emoji: "🌸", label: "blossom flower pink" },
      { emoji: "🌺", label: "flower hibiscus" },
      { emoji: "🌻", label: "sunflower yellow" },
      { emoji: "🌍", label: "earth globe world" },
      { emoji: "🏔️", label: "mountain peak snow" },
    ],
  },
  {
    cat: "Objects",
    items: [
      { emoji: "📚", label: "books study read learn" },
      { emoji: "📖", label: "book open read" },
      { emoji: "📝", label: "memo note write" },
      { emoji: "✏️", label: "pencil write draw" },
      { emoji: "💡", label: "lightbulb idea" },
      { emoji: "🔍", label: "search magnify find" },
      { emoji: "🔗", label: "link chain connect" },
      { emoji: "📌", label: "pin mark location" },
      { emoji: "📎", label: "paperclip attach" },
      { emoji: "🔑", label: "key unlock access" },
      { emoji: "💎", label: "diamond gem jewel value" },
      { emoji: "🏆", label: "trophy win award" },
      { emoji: "🎯", label: "target goal dart" },
      { emoji: "📊", label: "chart bar data" },
      { emoji: "📈", label: "chart up growth trend" },
      { emoji: "📉", label: "chart down decline" },
      { emoji: "💼", label: "briefcase work business" },
      { emoji: "🖥️", label: "desktop computer screen" },
      { emoji: "⚙️", label: "gear settings config" },
      { emoji: "🔧", label: "wrench tool fix" },
      { emoji: "🛡️", label: "shield protect security" },
      { emoji: "⚡", label: "lightning bolt fast energy" },
    ],
  },
  {
    cat: "Finance",
    items: [
      { emoji: "💰", label: "money bag cash wealth" },
      { emoji: "💵", label: "dollar bill cash" },
      { emoji: "💳", label: "credit card payment" },
      { emoji: "🏦", label: "bank finance building" },
      { emoji: "💹", label: "chart yen up market" },
      { emoji: "🪙", label: "coin gold money" },
      { emoji: "💲", label: "dollar sign" },
      { emoji: "🤑", label: "money face rich" },
      { emoji: "💸", label: "money flying spend" },
      { emoji: "🏧", label: "atm cash withdraw" },
    ],
  },
  {
    cat: "Places",
    items: [
      { emoji: "🏠", label: "home house" },
      { emoji: "🏢", label: "office building company" },
      { emoji: "🏛️", label: "pillars institution" },
      { emoji: "✈️", label: "plane travel fly" },
      { emoji: "🚀", label: "rocket launch space fast" },
      { emoji: "🗺️", label: "map world navigate" },
      { emoji: "🌆", label: "cityscape buildings city" },
      { emoji: "🏫", label: "school education" },
      { emoji: "🏥", label: "hospital medical health" },
    ],
  },
  {
    cat: "Symbols",
    items: [
      { emoji: "❤️", label: "heart love red" },
      { emoji: "🧡", label: "heart orange" },
      { emoji: "💛", label: "heart yellow" },
      { emoji: "💚", label: "heart green" },
      { emoji: "💙", label: "heart blue" },
      { emoji: "💜", label: "heart purple" },
      { emoji: "🖤", label: "heart black" },
      { emoji: "✅", label: "check ok yes done" },
      { emoji: "❌", label: "x no cross cancel" },
      { emoji: "♻️", label: "recycle green" },
      { emoji: "⭕", label: "circle red" },
      { emoji: "🔰", label: "beginner leaf green" },
      { emoji: "🚩", label: "flag red" },
      { emoji: "🎪", label: "circus tent" },
    ],
  },
];

function resolveIconBg(iconColor?: string): string {
  return ICON_COLORS.find((c) => c.value === iconColor)?.bg ?? "";
}

/* ─────────────────────────── Component ─────────────────────── */

export function AdminWorkspace() {
  const router = useRouter();
  const idRef = useRef(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const arthurScrollRef = useRef<HTMLDivElement>(null);
  const tagMenuRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const slashSearchRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const iconPickerRef = useRef<HTMLDivElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const userSettingsRef = useRef<HTMLDivElement>(null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const pdfBlobUrlsRef = useRef<Map<string, string>>(new Map());

  /* ── Simulation refs ── */
  const simNodesRef = useRef<SimNode[]>([]);
  const simNodeMapRef = useRef<Map<string, SimNode>>(new Map());
  const alphaRef = useRef(1);
  const rafRef = useRef<number>(0);
  const draggedIdRef = useRef<string | null>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const activeEdgesRef = useRef<GraphEdge[]>([]);
  const focusAnimRef = useRef<number>(0);
  const pagesRef = useRef<Record<string, PageData>>(normalizedInitialPages);
  const pageHistoryRef = useRef<string[]>([]);
  const pageHistoryIndexRef = useRef(-1);

  /* ── Graph store ── */
  const gStore = useGraphStore();

  /* ── Sidebar state ── */
  const [tree, setTree] = useState<SidebarItem[]>(initialTree);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(initialTree.filter((i) => i.type === "folder").map((i) => i.id)),
  );
  const [pages, setPages] = useState<Record<string, PageData>>(normalizedInitialPages);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameOriginalValue, setRenameOriginalValue] = useState("");
  const [sidebarDragSrc, setSidebarDragSrc] = useState<string | null>(null);
  const [sidebarDrop, setSidebarDrop] = useState<{ id: string; position: "before" | "after" | "into" } | null>(null);

  /* ── App mode: product (read-only published content) | personal (editable workspace) ── */
  const [appMode, setAppMode] = useState<"product" | "personal">("product");

  /* ── Graph layer: filters which nodes are visible ── */
  const [graphLayer, setGraphLayer] = useState<"news" | "deals" | "personal">("news");

  /* ── Navigation ── */
  const [view, setView] = useState<"graph" | "page" | "library" | "deals">("graph");
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
  const isHoveringPreviewRef = useRef(false);
  const nodeHoverClearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ── Drag / pan state ── */
  const [dragState, setDragState] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    startNodeX: number;
    startNodeY: number;
    moved: boolean;
  } | null>(null);
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    startTransformX: number;
    startTransformY: number;
  } | null>(null);

  /* ── Context menu ── */
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  /* ── Deal Tracker ── */
  const [deals, setDeals] = useState<Record<string, Deal>>(initialDeals);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [dealForm, setDealForm] = useState<Partial<Deal> | null>(null);
  const [dealStatusFilter, setDealStatusFilter] = useState<DealStatus | "all">("all");

  /* ── Arthur AI ── */
  const [arthurThreads, setArthurThreads] = useState<Record<string, ArthurThreadState>>({});
  const [arthurInput, setArthurInput] = useState("");
  const [sharedPdfs, setSharedPdfs] = useState<Record<string, SharedPdf>>({});
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfUploadStatus, setPdfUploadStatus] = useState<string | null>(null);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(null);
  const [pdfAssignmentQuery, setPdfAssignmentQuery] = useState("");
  const [iconPicker, setIconPicker] = useState<IconPickerState | null>(null);
  const [iconPickerSearch, setIconPickerSearch] = useState("");
  const [userSettingsOpen, setUserSettingsOpen] = useState(false);

  /* ── Floating format toolbar ── */
  const [formatBar, setFormatBar] = useState<{ x: number; y: number } | null>(null);
  const formatBarRef = useRef<HTMLDivElement>(null);

  /* ── Tag editing ── */
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");

  /* ── Sidebar delete confirmation ── */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* ── Slash command menu ── */
  const [slashMenu, setSlashMenu] = useState<{
    top: number;
    left: number;
    query: string;
    mode: "root" | "link-page" | "pdf-pick" | "ai-prompt";
  } | null>(null);
  const [aiPromptInput, setAiPromptInput] = useState("");
  const [aiPromptLoading, setAiPromptLoading] = useState(false);
  const [aiPromptError, setAiPromptError] = useState<string | null>(null);
  const aiPromptInputRef = useRef<HTMLInputElement>(null);
  const [slashCmdIdx, setSlashCmdIdx] = useState(0);
  const [linkPageQuery, setLinkPageQuery] = useState("");
  const [pdfPickQuery, setPdfPickQuery] = useState("");
  const [isBodyDropActive, setIsBodyDropActive] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const slashRangeRef = useRef<Range | null>(null);

  /* ─── Derived graph state ─── */

  const allPages = useMemo(() => getAllPagesFlat(tree), [tree]);
  const authSessionRaw = useSyncExternalStore(
    subscribeToAuthState,
    getAuthSessionSnapshot,
    () => null,
  );
  const authSession = useMemo(() => parseLocalAuthSession(authSessionRaw), [authSessionRaw]);
  const graphEdges = useMemo(() => deriveGraphEdges(tree, pages), [tree, pages]);
  const sharedPdfList = useMemo(
    () => Object.values(sharedPdfs).sort((a, b) => b.uploadedAt - a.uploadedAt),
    [sharedPdfs],
  );
  const pageAssignedPdfs = useMemo(
    () =>
      selectedId
        ? sharedPdfList.filter((pdf) => pdf.assignedPageIds.includes(selectedId))
        : [],
    [selectedId, sharedPdfList],
  );

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
    if (view === "library") {
      return;
    }

    setSelectedPdfId(null);
    setPdfAssignmentQuery("");
  }, [view]);

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

      alphaRef.current = Math.max(0, alpha * SIM_ALPHA_DECAY);

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
        const repelScale = SIM_REPEL_SIZE_BASE + SIM_REPEL_SIZE_SCALE * nodeSize;

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
              const collisionF = overlap * SIM_COLLISION_FORCE * alpha;
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
          n.vx *= SIM_VELOCITY_DAMPING;
          n.vy *= SIM_VELOCITY_DAMPING;
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
  }, [selectedId]);

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
        x: CANVAS_W / 2 + SIM_NEW_NODE_RING_RADIUS * Math.cos(angle),
        y: CANVAS_H / 2 + SIM_NEW_NODE_RING_RADIUS * Math.sin(angle),
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
      const r = Math.min(CANVAS_W, CANVAS_H) * INITIAL_RING_RADIUS_RATIO;
      return {
        id: p.id,
        x: CANVAS_W / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * INITIAL_NODE_JITTER,
        y: CANVAS_H / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * INITIAL_NODE_JITTER,
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
  }, [arthurThreads, selectedId]);

  /* ── Focus tag input when menu opens, reset when it closes ── */
  useEffect(() => {
    if (addingTag) {
      setTimeout(() => tagInputRef.current?.focus(), 0);
    } else {
      setTagInput("");
    }
  }, [addingTag]);

  /* ── Sync body innerHTML when page content changes externally ── */
  useEffect(() => {
    const nextBody = (selectedId && pages[selectedId]?.body) || "";
    if (bodyRef.current && document.activeElement !== bodyRef.current && bodyRef.current.innerHTML !== nextBody) {
      bodyRef.current.innerHTML = nextBody;
    }
  }, [selectedId, pages]);

  /* ── Set page title when switching pages ── */
  useEffect(() => {
    if (!titleRef.current || !selectedId) return;
    titleRef.current.textContent = pages[selectedId]?.title ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* ── Sync page title when renamed externally (e.g. sidebar rename) ── */
  useEffect(() => {
    if (!titleRef.current || !selectedId) return;
    if (document.activeElement === titleRef.current) return;
    const nextTitle = pages[selectedId]?.title ?? "";
    if (titleRef.current.textContent !== nextTitle) {
      titleRef.current.textContent = nextTitle;
    }
  }, [selectedId, pages]);

  /* ── Reset slash menu when switching pages ── */
  useEffect(() => {
    setSlashMenu(null);
    setSlashCmdIdx(0);
    setLinkPageQuery("");
    slashRangeRef.current = null;
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
    if (slashMenu?.mode === "link-page" || slashMenu?.mode === "pdf-pick") {
      window.setTimeout(() => slashSearchRef.current?.focus(), 0);
    }
    if (slashMenu?.mode === "ai-prompt") {
      window.setTimeout(() => aiPromptInputRef.current?.focus(), 0);
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

  useEffect(() => {
    if (!iconPicker) return;
    const handler = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setIconPicker(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIconPicker(null);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [iconPicker]);


  useEffect(() => {
    if (!iconPicker) return;
    window.setTimeout(() => {
      iconInputRef.current?.focus();
      iconInputRef.current?.select();
    }, 0);
  }, [iconPicker]);

  useEffect(() => {
    if (!userSettingsOpen) return;
    const handler = (e: MouseEvent) => {
      if (userSettingsRef.current && !userSettingsRef.current.contains(e.target as Node)) {
        setUserSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserSettingsOpen(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [userSettingsOpen]);

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
    const duration = FOCUS_ANIMATION_MS;

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

  // Identify product (news/tmpl) pages for graph layer filtering
  const productPageIds = useMemo(() => {
    const ids = new Set<string>();
    function walk(items: SidebarItem[], inProduct: boolean) {
      for (const item of items) {
        const mine = inProduct || item.id === "tmpl-folder";
        if (mine && item.type === "page") ids.add(item.id);
        if (item.type === "folder" && item.children) walk(item.children, mine);
      }
    }
    walk(tree, false);
    return ids;
  }, [tree]);

  // Filter by search + tag + graph layer
  const filteredIds = useMemo<Set<string> | null>(() => {
    const q = graphSearch.trim().toLowerCase();
    const layerSet = graphLayer === "news"
      ? productPageIds
      : graphLayer === "personal"
        ? new Set(allPages.map((p) => p.id).filter((id) => !productPageIds.has(id)))
        : null; // deals layer handled separately

    const needsFilter = q || activeTag || layerSet;
    if (!needsFilter) return null;

    return new Set(
      allPages
        .filter((p) => {
          const pd = pages[p.id];
          const matchQ =
            !q ||
            (pd?.title ?? p.label).toLowerCase().includes(q) ||
            pd?.tags?.some((t) => t.toLowerCase().includes(q));
          const matchTag = !activeTag || pd?.tags?.includes(activeTag);
          const matchLayer = !layerSet || layerSet.has(p.id);
          return matchQ && matchTag && matchLayer;
        })
        .map((p) => p.id),
    );
  }, [graphSearch, activeTag, graphLayer, allPages, pages, productPageIds]);

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

  // Tags available to add: all tags created so far across the workspace
  const availableTags = useMemo(() => usedTags, [usedTags]);

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

    if (slashMenu.mode === "pdf-pick") {
      const q = pdfPickQuery.trim().toLowerCase();
      return pageAssignedPdfs
        .filter((pdf) => !q || pdf.name.toLowerCase().includes(q))
        .slice(0, 10)
        .map((pdf) => ({
          id: pdf.id,
          label: pdf.name,
          description: pdf.pageCount
            ? `${pdf.pageCount} pages - Assigned to this page`
            : "Assigned to this page",
          kind: "pdf-embed" as const,
          icon: "PDF",
        }));
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
  }, [allPages, linkPageQuery, pageAssignedPdfs, pages, pdfPickQuery, selectedId, slashMenu]);

  useEffect(() => {
    if (!slashMenu) return;
    if (slashCommands.length === 0) {
      if (slashMenu.mode === "pdf-pick") {
        setSlashCmdIdx(0);
        return;
      }
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
      x: CANVAS_W / 2 + (Math.random() - 0.5) * SIM_CREATED_NODE_SPREAD,
      y: CANVAS_H / 2 + (Math.random() - 0.5) * SIM_CREATED_NODE_SPREAD,
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
    if (view !== "graph") {
      openPage(id, "reset");
    }
  }, [createPage, openPage, view]);

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
      setSharedPdfs((prev) => {
        const next: Record<string, SharedPdf> = {};
        let changed = false;

        for (const [pdfId, pdf] of Object.entries(prev)) {
          const assignedPageIds = pdf.assignedPageIds.filter((pageId) => pageId !== id);
          next[pdfId] =
            assignedPageIds.length === pdf.assignedPageIds.length
              ? pdf
              : { ...pdf, assignedPageIds };
          if (assignedPageIds.length !== pdf.assignedPageIds.length) changed = true;
        }

        return changed ? next : prev;
      });
      setArthurThreads((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      simNodesRef.current = simNodesRef.current.filter((n) => n.id !== id);
      simNodeMapRef.current.delete(id);
      if (selectedId === id) { setSelectedId(null); setView("graph"); }
      if (graphHighlightId === id) setGraphHighlightId(null);
      if (contextMenu?.nodeId === id) setContextMenu(null);
    } else {
      const folderNode = tree.find((n) => n.id === id);
      const removedPages = getAllPagesFlat(folderNode?.children ?? []);
      const removedIds = new Set(removedPages.map((page) => page.id));
      setSharedPdfs((prev) => {
        const next: Record<string, SharedPdf> = {};
        let changed = false;

        for (const [pdfId, pdf] of Object.entries(prev)) {
          const assignedPageIds = pdf.assignedPageIds.filter((pageId) => !removedIds.has(pageId));
          next[pdfId] =
            assignedPageIds.length === pdf.assignedPageIds.length
              ? pdf
              : { ...pdf, assignedPageIds };
          if (assignedPageIds.length !== pdf.assignedPageIds.length) changed = true;
        }

        return changed ? next : prev;
      });
      setArthurThreads((prev) => {
        const next = { ...prev };
        let changed = false;
        removedIds.forEach((pageId) => {
          if (pageId in next) {
            delete next[pageId];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      for (const p of removedPages) {
        simNodesRef.current = simNodesRef.current.filter((n) => n.id !== p.id);
        simNodeMapRef.current.delete(p.id);
      }
    }
  };

  const commitRename = (id: string, type: "folder" | "page") => {
    const val = renameValue.trim() || (type === "page" ? "Untitled" : "New Folder");
    setTree((prev) => renameItemLabel(prev, id, val));
    if (type === "page") {
      updatePage(id, { title: val });
    }
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
    setPages((prev) => {
      const currentPage = prev[id];
      if (!currentPage) {
        return prev;
      }

      const normalizedPatch =
        patch.tags
          ? {
              ...patch,
              tags: normalizeTagList(patch.tags),
            }
          : patch;

      const nextTitle = normalizedPatch.title;
      const titleChanged =
        typeof nextTitle === "string" && nextTitle !== currentPage.title;

      let nextPages = {
        ...prev,
        [id]: { ...currentPage, ...normalizedPatch },
      };

      if (titleChanged && nextTitle) {
        nextPages = syncLinkedPageLabelsInPages(nextPages, id, nextTitle);

        if (bodyRef.current) {
          const linkedNodes = bodyRef.current.querySelectorAll<HTMLElement>(
            `[data-page-id="${id}"]`,
          );
          linkedNodes.forEach((link) => {
            link.textContent = nextTitle;
          });
        }
      }

      return nextPages;
    });
  }, []);

  /* ── Product page identification ── */
  // tmpl-folder = published product content (read-only, can save a copy)
  const tmplPageIds = useMemo(() => {
    const ids = new Set<string>();
    function walk(items: SidebarItem[], inside: boolean) {
      for (const item of items) {
        const mine = inside || item.id === "tmpl-folder";
        if (mine && item.type === "page") ids.add(item.id);
        if (item.type === "folder" && item.children) walk(item.children, mine);
      }
    }
    walk(tree, false);
    return ids;
  }, [tree]);

  // guide-folder = locked educational content (read-only, already in workspace — no save button)
  const guidePageIds = useMemo(() => {
    const ids = new Set<string>();
    function walk(items: SidebarItem[], inside: boolean) {
      for (const item of items) {
        const mine = inside || item.id === "guide-folder";
        if (mine && item.type === "page") ids.add(item.id);
        if (item.type === "folder" && item.children) walk(item.children, mine);
      }
    }
    walk(tree, false);
    return ids;
  }, [tree]);

  // isProductPage = read-only (either tmpl or guide)
  const isProductPage = useCallback((id: string): boolean => {
    return tmplPageIds.has(id) || guidePageIds.has(id);
  }, [tmplPageIds, guidePageIds]);

  /* ── Save a product page to the personal workspace ── */
  const savePageToPersonal = useCallback((pageId: string) => {
    const pg = pages[pageId];
    if (!pg) return;
    const newId = `saved-${pageId}-${Date.now()}`;
    const savedPage: PageData = {
      ...pg,
      title: pg.title,
      tags: [...new Set([...(pg.tags ?? []), "saved"])],
      createdAt: Date.now(),
    };
    setPages((prev) => ({ ...prev, [newId]: savedPage }));
    setTree((prev) => [...prev, { id: newId, label: pg.title || "Untitled", type: "page" as const }]);
    // Switch to personal mode so user sees it immediately
    setAppMode("personal");
    setGraphLayer("personal");
    openPage(newId, "reset");
  }, [pages, openPage]);

  const addTagToSelectedPage = useCallback((rawTag: string) => {
    const normalizedTag = normalizeTagLabel(rawTag);
    if (!selectedId || !normalizedTag) {
      return;
    }

    if ((pages[selectedId]?.tags ?? []).some((tag) => tag.toLowerCase() === normalizedTag.toLowerCase())) {
      return;
    }

    updatePage(selectedId, { tags: [...(pages[selectedId]?.tags ?? []), normalizedTag] });
  }, [pages, selectedId, updatePage]);

  const handlePdfUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    if (files.some((file) => file.type !== "application/pdf")) {
      setPdfUploadError("Please upload a PDF file.");
      event.target.value = "";
      return;
    }

    setPdfUploadError(null);
    setPdfUploading(true);
    setPdfUploadStatus("Extracting text from PDF...");
    const ocrTimer = window.setTimeout(() => {
      setPdfUploadStatus("Running OCR on scanned or image-heavy pages...");
    }, 2200);

    try {
      const uploadedPdfs: Record<string, SharedPdf> = {};

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/pdf/extract", {
          method: "POST",
          body: formData,
        });

        const data = (await response.json()) as {
          fileName?: string;
          text?: string;
          extractionMode?: "text" | "ocr" | "hybrid";
          pageCount?: number;
          error?: string;
        };

        if (!response.ok || !data.text) {
          throw new Error(data.error || `The PDF "${file.name}" could not be processed.`);
        }

        const extractedText = data.text;
        const pdfId = `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const pdfDisplayName = formatPdfDisplayName(data.fileName ?? file.name);

        uploadedPdfs[pdfId] = {
          id: pdfId,
          name: pdfDisplayName,
          text: extractedText,
          extractionMode: data.extractionMode,
          pageCount: data.pageCount,
          assignedPageIds: [],
          uploadedAt: Date.now(),
        };

        // Capture a blob URL so the PDF can be rendered in iframes this session
        const blobUrl = URL.createObjectURL(file);
        pdfBlobUrlsRef.current.set(pdfId, blobUrl);
      }

      setSharedPdfs((prev) => ({
        ...prev,
        ...uploadedPdfs,
      }));
    } catch (error) {
      setPdfUploadError(
        error instanceof Error ? error.message : "The PDF could not be processed.",
      );
    } finally {
      window.clearTimeout(ocrTimer);
      setPdfUploading(false);
      setPdfUploadStatus(null);
      event.target.value = "";
    }
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

  const insertPdfEmbed = useCallback((pdfId: string, pdfName: string) => {
    if (!bodyRef.current || !slashRangeRef.current || !selectedId) return;
    const pdf = sharedPdfs[pdfId];
    if (!pdf || !pdf.assignedPageIds.includes(selectedId)) {
      setPdfUploadError("Assign this PDF to the current page before inserting it.");
      closeSlashMenu();
      return;
    }
    const blobUrl = pdfBlobUrlsRef.current.get(pdfId) ?? "";
    const html = `<div class="ws-block-pdf" data-pdf-id="${pdfId}" data-pdf-name="${pdfName}" contenteditable="false"><div class="ws-block-pdf-toolbar"><span class="ws-block-pdf-name">${pdfName}</span></div><iframe class="ws-block-pdf-iframe" src="${blobUrl}" title="${pdfName}"></iframe></div>`;
    insertBlockFromSlash(html);
  }, [closeSlashMenu, insertBlockFromSlash, pdfBlobUrlsRef, selectedId, sharedPdfs]);

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
          ? createPage(command.label)
          : command.id;
      insertPageLink(pageId, command.label);
      return;
    }

    if (command.kind === "text") {
      insertBlockFromSlash('<p><br></p>');
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

    if (command.kind === "bulleted-list") {
      insertBlockFromSlash('<ul class="ws-block-list"><li>List item</li></ul>');
      return;
    }

    if (command.kind === "numbered-list") {
      insertBlockFromSlash('<ol class="ws-block-list ws-block-list-ordered"><li>List item</li></ol>');
      return;
    }

    if (command.kind === "todo") {
      insertBlockFromSlash(
        '<div class="ws-block-todo" data-block="todo" contenteditable="false"><button class="ws-block-todo-check" data-todo-check="1" data-checked="false" type="button" contenteditable="false" aria-label="Toggle complete"></button><span class="ws-block-todo-text" data-checked="false" contenteditable="true">To-do item</span></div>',
      );
      return;
    }

    if (command.kind === "quote") {
      insertBlockFromSlash('<blockquote class="ws-block-quote"><p>Quote or key passage</p></blockquote>');
      return;
    }

    if (command.kind === "divider") {
      insertBlockFromSlash('<hr class="ws-block-divider" contenteditable="false">');
      return;
    }

    if (command.kind === "toggle") {
      insertBlockFromSlash(
        '<details class="ws-block-toggle"><summary class="ws-block-toggle-head" contenteditable="true">Toggle title</summary><div class="ws-block-toggle-body" contenteditable="true"><p>Toggle content</p></div></details>',
      );
      return;
    }

    if (command.kind === "callout") {
      insertBlockFromSlash(
        '<div class="ws-block-callout" contenteditable="false"><span class="ws-block-callout-icon" contenteditable="false">💡</span><div class="ws-block-callout-body" contenteditable="true"><p>Add a note or callout here</p></div></div>',
      );
      return;
    }

    if (command.kind === "code") {
      insertBlockFromSlash('<pre class="ws-block-code" contenteditable="true" spellcheck="false">// Enter code here</pre>');
      return;
    }

    if (command.kind === "table") {
      insertBlockFromSlash(
        '<table class="ws-block-table"><thead><tr><th contenteditable="true">Column 1</th><th contenteditable="true">Column 2</th></tr></thead><tbody><tr><td contenteditable="true">Cell</td><td contenteditable="true">Cell</td></tr></tbody></table>',
      );
      return;
    }

    if (command.kind === "external-link") {
      insertBlockFromSlash(
        '<p><a class="ws-inline-link" href="https://" target="_blank" rel="noreferrer">Paste external link</a></p>',
      );
      return;
    }

    if (command.kind === "pdf-pick-menu") {
      setSlashMenu((prev) => prev ? { ...prev, mode: "pdf-pick" } : prev);
      setPdfPickQuery("");
      setSlashCmdIdx(0);
      return;
    }

    if (command.kind === "pdf-embed") {
      insertPdfEmbed(command.id, command.label);
      return;
    }

    if (command.kind === "ai-write") {
      setSlashMenu((prev) => prev ? { ...prev, mode: "ai-prompt" } : prev);
      setAiPromptInput("");
      setAiPromptError(null);
      setSlashCmdIdx(0);
      return;
    }

  }, [createPage, insertBlockFromSlash, insertPageLink, insertPdfEmbed]);

  /* ─── /ai inline page write ─── */

  const sendAiWrite = async () => {
    const prompt = aiPromptInput.trim();
    if (!prompt || !selectedId || aiPromptLoading) return;

    setAiPromptLoading(true);
    setAiPromptError(null);

    try {
      const response = await fetch("/api/arthur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          editMode: true,
          selectedPageId: selectedId,
          readOnly: false,
          pageTitle: pages[selectedId]?.title ?? "",
          pageBody: pages[selectedId]?.body ?? "",
          pageTags: pages[selectedId]?.tags ?? [],
          pagePdfs: sharedPdfList
            .filter((pdf) => pdf.assignedPageIds.includes(selectedId))
            .map((pdf) => ({ id: pdf.id, name: pdf.name, text: pdf.text, extractionMode: pdf.extractionMode })),
          workspacePages: allPages.map((page) => ({
            id: page.id,
            title: pages[page.id]?.title ?? page.label,
            body: pages[page.id]?.body ?? "",
            tags: pages[page.id]?.tags ?? [],
          })),
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
        pageEdit?: { body: string };
      };

      if (!response.ok || !data.pageEdit?.body) {
        throw new Error(data.error || "Arthur couldn't write to the page.");
      }

      const newBody = data.pageEdit.body;
      updatePage(selectedId, { body: newBody });
      if (bodyRef.current) {
        bodyRef.current.innerHTML = newBody;
      }

      setAiPromptInput("");
      setAiPromptLoading(false);
      closeSlashMenu();
      bodyRef.current?.focus();
    } catch (err) {
      setAiPromptError(err instanceof Error ? err.message : "Something went wrong.");
      setAiPromptLoading(false);
    }
  };

  /* ─── Arthur sidebar chat ─── */

  const sendArthur = async () => {
    const txt = arthurInput.trim();
    if (!txt || !selectedId) return;

    const currentThread = arthurThreads[selectedId] ?? createArthurThread();
    if (currentThread.typing) return;

    setArthurThreads((prev) => ({
      ...prev,
      [selectedId]: {
        ...(prev[selectedId] ?? createArthurThread()),
        error: null,
        typing: true,
        status:
          sharedPdfList.filter((pdf) => pdf.assignedPageIds.includes(selectedId)).length > 0
            ? "Arthur is reviewing this page and its linked PDFs..."
            : "Arthur is reviewing this page...",
        messages: [
          ...(prev[selectedId]?.messages ?? DEFAULT_ARTHUR_MESSAGES),
          { role: "user", text: txt },
        ],
      },
    }));
    setArthurInput("");

    try {
      const response = await fetch("/api/arthur", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: txt,
          selectedPageId: selectedId,
          editMode: false,
          pageTitle: selectedId ? pages[selectedId]?.title ?? "" : "",
          pageBody: selectedId ? pages[selectedId]?.body ?? "" : "",
          pageTags: selectedId ? pages[selectedId]?.tags ?? [] : [],
          pagePdfs: sharedPdfList
            .filter((pdf) => pdf.assignedPageIds.includes(selectedId))
            .map((pdf) => ({
              id: pdf.id,
              name: pdf.name,
              text: pdf.text,
              extractionMode: pdf.extractionMode,
            })),
          workspacePages: allPages.map((page) => ({
            id: page.id,
            title: pages[page.id]?.title ?? page.label,
            body: pages[page.id]?.body ?? "",
            tags: pages[page.id]?.tags ?? [],
          })),
        }),
      });

      const data = (await response.json()) as {
        answer?: string;
        error?: string;
        pageEdit?: { body: string };
      };

      if (!response.ok || !data.answer) {
        throw new Error(data.error || "Arthur could not generate a reply.");
      }

      const answer = data.answer;

      setArthurThreads((prev) => ({
        ...prev,
        [selectedId]: {
          ...(prev[selectedId] ?? createArthurThread()),
          typing: false,
          error: null,
          status: null,
          messages: [
            ...(prev[selectedId]?.messages ?? DEFAULT_ARTHUR_MESSAGES),
            { role: "ai", text: answer },
          ],
        },
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Arthur could not generate a reply.";

      setArthurThreads((prev) => ({
        ...prev,
        [selectedId]: {
          ...(prev[selectedId] ?? createArthurThread()),
          typing: false,
          error: message,
          status: null,
          messages: [
            ...(prev[selectedId]?.messages ?? DEFAULT_ARTHUR_MESSAGES),
            {
              role: "ai",
              text: "I couldn't answer just now. Check your Cohere API key in `.env.local` and try again.",
            },
          ],
        },
      }));
    }
  };

  /* ─── Graph mouse handlers ─── */

  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    setGraphHighlightId(null);
    setContextMenu(null);
    setPanState({ startX: e.clientX, startY: e.clientY, startTransformX: transform.x, startTransformY: transform.y });
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
      startX: e.clientX,
      startY: e.clientY,
      startNodeX: pos.x,
      startNodeY: pos.y,
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
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(dx, dy) < 4) return;
      setDragState((prev) => (prev ? { ...prev, moved: true } : prev));
      const newX = dragState.startNodeX + dx / transformRef.current.scale;
      const newY = dragState.startNodeY + dy / transformRef.current.scale;
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
        x: panState.startTransformX + (e.clientX - panState.startX),
        y: panState.startTransformY + (e.clientY - panState.startY),
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

    const textNode =
      anchorNode.nodeType === Node.TEXT_NODE
        ? (anchorNode as Text)
        : anchorNode.childNodes[range.startOffset - 1]?.nodeType === Node.TEXT_NODE
        ? (anchorNode.childNodes[range.startOffset - 1] as Text)
        : null;
    const textOffset =
      anchorNode.nodeType === Node.TEXT_NODE ? range.startOffset : textNode?.data.length ?? 0;

    if (!textNode) {
      setSlashMenu(null);
      setSlashCmdIdx(0);
      slashRangeRef.current = null;
      return;
    }

    const textBeforeCaret = textNode.data.slice(0, textOffset);
    const slashMatch = textBeforeCaret.match(/(?:^|\s)\/([^/]*)$/);

    if (!slashMatch) {
      setSlashMenu(null);
      setSlashCmdIdx(0);
      slashRangeRef.current = null;
      return;
    }

    const query = slashMatch[1] ?? "";
    const slashOffset = textOffset - query.length - 1;
    const slashRange = document.createRange();
    slashRange.setStart(textNode, slashOffset);
    slashRange.setEnd(textNode, textOffset);

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

  /* ── Inline code wrap ── */
  const wrapInlineCode = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const code = document.createElement("code");
    try {
      range.surroundContents(code);
    } catch {
      const text = sel.toString();
      const el = document.createElement("code");
      el.textContent = text;
      range.deleteContents();
      range.insertNode(el);
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(el);
      sel.addRange(r);
    }
  }, []);

  /* ── Floating format bar: show on selection ── */
  const updateFormatBar = useCallback(() => {
    if (view !== "page") { setFormatBar(null); return; }
    if (selectedId && isProductPage(selectedId)) { setFormatBar(null); return; }
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setFormatBar(null); return; }
    if (!bodyRef.current?.contains(sel.anchorNode)) { setFormatBar(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { setFormatBar(null); return; }
    setFormatBar({ x: rect.left + rect.width / 2, y: rect.top });
  }, [view, selectedId, isProductPage]);

  const handleBodyMouseUp = useCallback(() => {
    setTimeout(updateFormatBar, 0);
  }, [updateFormatBar]);

  const handleBodyKeyUp = useCallback((e: React.KeyboardEvent) => {
    if (e.shiftKey || e.key === "Shift") setTimeout(updateFormatBar, 0);
  }, [updateFormatBar]);

  const handleFormatCmd = useCallback((cmd: string) => {
    bodyRef.current?.focus();
    document.execCommand(cmd);
    saveCurrentBody();
    setTimeout(updateFormatBar, 0);
  }, [saveCurrentBody, updateFormatBar]);

  const handleBodyKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    /* ── Slash menu takes priority ── */
    if (slashMenu) {
      if (slashCommands.length > 0) {
        if (event.key === "ArrowDown") { event.preventDefault(); setSlashCmdIdx((p) => (p + 1) % slashCommands.length); return; }
        if (event.key === "ArrowUp")   { event.preventDefault(); setSlashCmdIdx((p) => (p - 1 + slashCommands.length) % slashCommands.length); return; }
        if (event.key === "Enter")     { event.preventDefault(); applySlashCommand(slashCommands[slashCmdIdx] ?? slashCommands[0]); return; }
      }
      if (event.key === "Escape") { event.preventDefault(); closeSlashMenu(); }
      return;
    }

    const mod = event.ctrlKey || event.metaKey;

    /* ── Text formatting shortcuts ── */
    if (mod) {
      if (event.key.toLowerCase() === "b") { event.preventDefault(); handleFormatCmd("bold"); return; }
      if (event.key.toLowerCase() === "i") { event.preventDefault(); handleFormatCmd("italic"); return; }
      if (event.key.toLowerCase() === "u") { event.preventDefault(); handleFormatCmd("underline"); return; }
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        wrapInlineCode();
        saveCurrentBody();
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleFormatCmd("strikeThrough");
        return;
      }
    }

    /* ── Shift+Enter: soft line break ── */
    if (event.key === "Enter" && event.shiftKey && !mod) {
      event.preventDefault();
      document.execCommand("insertLineBreak");
      saveCurrentBody();
      return;
    }

    /* ── Enter on empty list item → exit list ── */
    if (event.key === "Enter" && !event.shiftKey && !mod) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const node = sel.getRangeAt(0).startContainer;
        const li = (node instanceof HTMLElement ? node : node.parentElement)?.closest("li");
        if (li && (li.textContent ?? "").trim() === "") {
          event.preventDefault();
          const list = li.closest("ul, ol");
          if (list?.parentNode) {
            const p = document.createElement("p");
            p.innerHTML = "<br>";
            list.parentNode.insertBefore(p, list.nextSibling);
            li.remove();
            if (list.children.length === 0) list.remove();
            const range = document.createRange();
            range.setStart(p, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            saveCurrentBody();
          }
          return;
        }
      }
    }

    /* ── Tab / Shift+Tab: indent/unindent list items ── */
    if (event.key === "Tab") {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const node = sel.getRangeAt(0).startContainer;
        const li = (node instanceof HTMLElement ? node : node.parentElement)?.closest("li");
        if (li) {
          event.preventDefault();
          if (!event.shiftKey) {
            const prev = li.previousElementSibling;
            if (prev) {
              let sub = prev.querySelector<HTMLElement>("ul, ol");
              if (!sub) {
                sub = document.createElement(li.closest("ol") ? "ol" : "ul") as HTMLElement;
                sub.className = "ws-block-list";
                prev.appendChild(sub);
              }
              sub.appendChild(li);
            }
          } else {
            const parentList = li.parentElement;
            const grandLi = parentList?.parentElement?.closest("li");
            if (grandLi?.parentElement && parentList) {
              grandLi.parentElement.insertBefore(li, grandLi.nextSibling);
              if (parentList.children.length === 0) parentList.remove();
            }
          }
          saveCurrentBody();
          return;
        }
      }
    }
  }, [applySlashCommand, closeSlashMenu, handleFormatCmd, saveCurrentBody, slashCmdIdx, slashCommands, slashMenu, wrapInlineCode]);

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
    if (!(target instanceof HTMLElement)) return;

    /* ── Todo checkbox toggle ── */
    const checkBtn = target.closest<HTMLElement>("[data-todo-check]");
    if (checkBtn) {
      event.preventDefault();
      const isChecked = checkBtn.dataset.checked === "true";
      checkBtn.dataset.checked = isChecked ? "false" : "true";
      const textEl = checkBtn.parentElement?.querySelector<HTMLElement>(".ws-block-todo-text");
      if (textEl) textEl.dataset.checked = isChecked ? "false" : "true";
      saveCurrentBody();
      return;
    }

    /* ── Page link navigation ── */
    const link = target.closest<HTMLElement>("[data-page-id]");
    if (!link) return;

    event.preventDefault();
    const pageId = link.dataset.pageId;
    if (!pageId) return;

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

  const openIconPicker = useCallback((
    event: React.MouseEvent<HTMLElement>,
    pageId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setIconPickerSearch("");
    setIconPicker({
      pageId,
      top: rect.bottom + 10,
      left: rect.left,
      selectedColor: pages[pageId]?.iconColor ?? "",
    });
  }, [pages]);

  const applyPageIcon = useCallback((pageId: string, icon: string) => {
    const color = iconPicker?.selectedColor ?? "";
    updatePage(pageId, { icon: icon.trim(), iconColor: icon.trim() ? color : "" });
    setIconPicker(null);
  }, [updatePage, iconPicker]);

  const setIconPickerColor = useCallback((color: string) => {
    if (!iconPicker) return;
    setIconPicker((prev) => prev ? { ...prev, selectedColor: color } : null);
    updatePage(iconPicker.pageId, { iconColor: color });
  }, [iconPicker, updatePage]);


  /* ─── Deal CRUD ─── */

  /* Ensure a "Deals" folder exists in the personal tree, return its id */
  const ensureDealsFolderRef = useRef<string | null>(null);
  const ensureDealsFolder = useCallback((): string => {
    // Check if we already have a deals folder recorded
    if (ensureDealsFolderRef.current) return ensureDealsFolderRef.current;
    // Scan tree for an existing deals-folder
    let found: string | null = null;
    function findFolder(items: SidebarItem[]) {
      for (const item of items) {
        if (item.id === "deals-folder") { found = item.id; return; }
        if (item.type === "folder" && item.children) findFolder(item.children);
      }
    }
    setTree((prev) => {
      findFolder(prev);
      if (found) return prev;
      // Create it at root level
      found = "deals-folder";
      return [...prev, { id: "deals-folder", label: "Deals", type: "folder" as const, children: [] }];
    });
    const folderId = found ?? "deals-folder";
    ensureDealsFolderRef.current = folderId;
    return folderId;
  }, []);

  const addDeal = useCallback((initial: Partial<Deal> = {}) => {
    const id = `deal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const dealName = initial.name ?? "New Deal";

    // Auto-create a linked page if not already provided
    let linkedPageId = initial.linkedPageId;
    if (!linkedPageId) {
      const pageId = `page-gen-${idRef.current++}`;
      const pageTitle = dealName;
      const folderId = ensureDealsFolder();
      setTree((prev) => addItem(prev, folderId, { id: pageId, type: "page" as const, label: pageTitle }));
      setPages((prev) => ({
        ...prev,
        [pageId]: buildDealPageData(initial, pageTitle),
      }));
      setExpandedIds((prev) => new Set(prev).add(folderId));
      const newNode: SimNode = {
        id: pageId,
        x: CANVAS_W / 2 + (Math.random() - 0.5) * SIM_CREATED_NODE_SPREAD,
        y: CANVAS_H / 2 + (Math.random() - 0.5) * SIM_CREATED_NODE_SPREAD,
        vx: 0, vy: 0,
      };
      simNodesRef.current = [...simNodesRef.current, newNode];
      simNodeMapRef.current.set(pageId, newNode);
      alphaRef.current = Math.max(alphaRef.current, 0.5);
      linkedPageId = pageId;
    }

    const deal: Deal = {
      id,
      name: dealName,
      type: (initial.type as DealType) ?? "Mergers & Acquisitions",
      status: (initial.status as DealStatus) ?? "announced",
      amount: initial.amount ?? "",
      acquirer: initial.acquirer ?? "",
      target: initial.target ?? "",
      sector: initial.sector ?? "",
      advisors: initial.advisors ?? "",
      date: initial.date ?? new Date().toISOString().slice(0, 10),
      linkedPageId,
      createdAt: Date.now(),
    };
    setDeals((prev) => ({ ...prev, [id]: deal }));
    setSelectedDealId(id);
    setDealForm(deal);
    return id;
  }, [ensureDealsFolder]);

  useEffect(() => {
    const dealsMissingPages = Object.values(deals).filter(
      (deal) => !deal.linkedPageId || !pages[deal.linkedPageId],
    );

    if (dealsMissingPages.length === 0) {
      return;
    }

    const folderId = ensureDealsFolder();
    const createdPages: Array<{ dealId: string; pageId: string }> = [];

    setTree((prev) => {
      let nextTree = prev;
      for (const deal of dealsMissingPages) {
        const pageId = `page-gen-${idRef.current++}`;
        createdPages.push({ dealId: deal.id, pageId });
        nextTree = addItem(nextTree, folderId, {
          id: pageId,
          type: "page",
          label: deal.name,
        });
      }
      return nextTree;
    });

    setPages((prev) => {
      const nextPages = { ...prev };
      for (const { dealId, pageId } of createdPages) {
        const deal = deals[dealId];
        if (!deal) continue;
        nextPages[pageId] = buildDealPageData(deal, deal.name);
      }
      return nextPages;
    });

    setDeals((prev) => {
      const nextDeals = { ...prev };
      for (const { dealId, pageId } of createdPages) {
        if (!nextDeals[dealId]) continue;
        nextDeals[dealId] = { ...nextDeals[dealId], linkedPageId: pageId };
      }
      return nextDeals;
    });

    setExpandedIds((prev) => new Set(prev).add(folderId));

    const newNodes: SimNode[] = createdPages.map(({ pageId }) => ({
      id: pageId,
      x: CANVAS_W / 2 + (Math.random() - 0.5) * SIM_CREATED_NODE_SPREAD,
      y: CANVAS_H / 2 + (Math.random() - 0.5) * SIM_CREATED_NODE_SPREAD,
      vx: 0,
      vy: 0,
    }));
    simNodesRef.current = [...simNodesRef.current, ...newNodes];
    newNodes.forEach((node) => {
      simNodeMapRef.current.set(node.id, node);
    });
    alphaRef.current = Math.max(alphaRef.current, 0.5);
  }, [deals, ensureDealsFolder, pages]);

  const updateDeal = useCallback((id: string, patch: Partial<Deal>) => {
    setDeals((prev) => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: { ...prev[id], ...patch } };
    });
  }, []);

  const removeDeal = useCallback((id: string) => {
    setDeals((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSelectedDealId((prev) => (prev === id ? null : prev));
    setDealForm((prev) => (prev?.id === id ? null : prev));
  }, []);

  const togglePdfAssignment = useCallback((pdfId: string, pageId: string) => {
    setSharedPdfs((prev) => {
      const current = prev[pdfId];
      if (!current) return prev;
      const assignedPageIds = current.assignedPageIds.includes(pageId)
        ? current.assignedPageIds.filter((id) => id !== pageId)
        : [...current.assignedPageIds, pageId];

      return {
        ...prev,
        [pdfId]: {
          ...current,
          assignedPageIds,
        },
      };
    });
  }, []);

  const removeSharedPdf = useCallback((pdfId: string) => {
    setSharedPdfs((prev) => {
      if (!(pdfId in prev)) return prev;
      const next = { ...prev };
      delete next[pdfId];
      return next;
    });
    setSelectedPdfId((prev) => (prev === pdfId ? null : prev));
  }, []);

  const handleSidebarDragOver = (
    e: React.DragEvent,
    id: string,
    type: "folder" | "page",
  ) => {
    if (!sidebarDragSrc || sidebarDragSrc === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = (e.clientY - rect.top) / rect.height;
    let position: "before" | "after" | "into";
    if (type === "folder") {
      position = pct < 0.28 ? "before" : pct > 0.72 ? "after" : "into";
    } else {
      position = pct < 0.5 ? "before" : "after";
    }
    setSidebarDrop({ id, position });
  };
  const handleSidebarDrop = (
    e: React.DragEvent,
    targetId: string,
    type: "folder" | "page",
  ) => {
    e.preventDefault();
    if (!sidebarDragSrc || sidebarDragSrc === targetId || !sidebarDrop) return;
    if (sidebarDrop.position === "into" && type === "folder") {
      setTree((prev) => moveItemInto(prev, sidebarDragSrc, targetId));
      setExpandedIds((prev) => new Set(prev).add(targetId));
    } else {
      const pos = sidebarDrop.position === "into" ? "after" : sidebarDrop.position;
      setTree((prev) => moveItemRelative(prev, sidebarDragSrc, targetId, pos));
    }
    setSidebarDragSrc(null);
    setSidebarDrop(null);
  };
  const handleSidebarDragEnd = () => {
    setSidebarDragSrc(null);
    setSidebarDrop(null);
  };

  /* ─── Sidebar tree renderer ─── */

  const toggleFolderExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const renderTree = (items: SidebarItem[], depth = 0): React.ReactNode =>
    items.map((item) => {
      const isFolder = item.type === "folder";
      const isExpanded = isFolder && expandedIds.has(item.id);
      const isSelected = item.id === selectedId && view === "page";
      const isRenaming = item.id === renamingId;
      const dropInfo = sidebarDrop?.id === item.id ? sidebarDrop : null;
      const label = isFolder ? item.label : (pages[item.id]?.title ?? item.label);
      const groupColor = !isFolder ? nodeGroupMap.get(item.id) : undefined;
      // Guide folder and its children are locked (unremovable + uneditable)
      const isLocked = item.id === "guide-folder" || (depth > 0 && item.id.startsWith("guide-"));

      return (
        <div key={item.id} className="ws-tree-group">
          <div
            className={[
              "ws-tree-row",
              isSelected ? "ws-tree-row-active" : "",
              dropInfo?.position === "into" ? "ws-tree-row-drop" : "",
              dropInfo?.position === "before" ? "ws-tree-row-drop-before" : "",
              dropInfo?.position === "after" ? "ws-tree-row-drop-after" : "",
            ].filter(Boolean).join(" ")}
            style={{ paddingLeft: `${0.375 + depth * 1.1}rem` }}
            draggable
            onDragStart={(e) => handleSidebarDragStart(e, item.id)}
            onDragOver={(e) => handleSidebarDragOver(e, item.id, item.type)}
            onDrop={(e) => handleSidebarDrop(e, item.id, item.type)}
            onDragEnd={handleSidebarDragEnd}
          >
            <button
              className="ws-tree-expand"
              onClick={() => { if (isFolder) toggleFolderExpanded(item.id); }}
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
              <div
                className="ws-tree-label-btn"
                onClick={() => {
                  if (isFolder) {
                    toggleFolderExpanded(item.id);
                  } else {
                    openPage(item.id);
                  }
                }}
                onDoubleClick={() => {
                  if (!isLocked) startRename(item.id, label);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (isFolder) {
                      toggleFolderExpanded(item.id);
                    } else {
                      openPage(item.id);
                    }
                  }
                }}
              >
                {isFolder ? (
                  isExpanded ? (
                    <FolderOpen size={14} strokeWidth={1.8} className="ws-tree-icon" />
                  ) : (
                    <Folder size={14} strokeWidth={1.8} className="ws-tree-icon" />
                  )
                ) : (
                  <button
                    className={`ws-tree-page-icon-btn${pages[item.id]?.icon ? " ws-tree-page-icon-btn-emoji" : ""}`}
                    onClick={(event) => !isLocked && openIconPicker(event, item.id)}
                    type="button"
                    aria-label={isLocked ? undefined : "Change page icon"}
                    style={pages[item.id]?.icon && pages[item.id]?.iconColor ? { background: resolveIconBg(pages[item.id]?.iconColor) } : undefined}
                  >
                    {pages[item.id]?.icon ? (
                      <span className="ws-tree-page-icon-emoji" aria-hidden="true">
                        {pages[item.id]?.icon}
                      </span>
                    ) : (
                      <FileText
                        size={14}
                        strokeWidth={1.8}
                        className="ws-tree-icon"
                        style={groupColor ? { color: groupColor } : undefined}
                      />
                    )}
                  </button>
                )}
                <span className="ws-tree-label-text">{label}</span>
              </div>
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
              {isFolder && !isLocked && (
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
              {isLocked ? (
                <span className="ws-tree-locked-badge" title="This folder is read-only">
                  <Lock size={10} strokeWidth={2} />
                </span>
              ) : pendingDeleteId === item.id ? (
                <>
                  <button
                    className="ws-tree-action ws-tree-action-confirm"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearTimeout(pendingDeleteTimer.current);
                      setPendingDeleteId(null);
                      deleteItem(item.id, item.type);
                    }}
                    title="Confirm delete"
                    type="button"
                    aria-label="Confirm delete"
                  >
                    ✓
                  </button>
                  <button
                    className="ws-tree-action ws-tree-action-cancel"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearTimeout(pendingDeleteTimer.current);
                      setPendingDeleteId(null);
                    }}
                    title="Cancel"
                    type="button"
                    aria-label="Cancel delete"
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                </>
              ) : (
                <button
                  className="ws-tree-action ws-tree-action-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearTimeout(pendingDeleteTimer.current);
                    setPendingDeleteId(item.id);
                    pendingDeleteTimer.current = setTimeout(() => setPendingDeleteId(null), 3000);
                  }}
                  title="Delete"
                  type="button"
                  aria-label="Delete"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              )}
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
  const signedInEmail = authSession?.email ?? "reader@nova.ai";
  const userDisplayName = signedInEmail.split("@")[0]?.replace(/[._-]+/g, " ") || "Reader";
  const userAvatarLabel = userDisplayName.trim().charAt(0).toUpperCase() || "R";
  const handleSignOut = useCallback(() => {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    notifyAuthStateChanged();
    setUserSettingsOpen(false);
    router.replace("/");
  }, [router]);
  const handleSwitchAccount = useCallback(() => {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    notifyAuthStateChanged();
    setUserSettingsOpen(false);
    router.replace(buildSignInHref("/workspace"));
  }, [router]);

  const currentArthurThread = selectedId
    ? (arthurThreads[selectedId] ?? createArthurThread())
    : createArthurThread();
  const arthurMessages = currentArthurThread.messages;
  const arthurTyping = currentArthurThread.typing;
  const arthurError = currentArthurThread.error;
  const arthurStatus = currentArthurThread.status;
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
            className={`ws-icon-btn${view === "library" ? " ws-icon-btn-active" : ""}`}
            title="PDF library"
            type="button"
            onClick={() => setView("library")}
            aria-pressed={view === "library"}
            aria-label="PDF library"
          >
            <Files size={14} strokeWidth={1.8} />
          </button>
          <button
            className={`ws-icon-btn${view === "deals" ? " ws-icon-btn-active" : ""}`}
            title="Deal tracker"
            type="button"
            onClick={() => setView("deals")}
            aria-pressed={view === "deals"}
            aria-label="Deal tracker"
          >
            <TrendingUp size={14} strokeWidth={1.8} />
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
          <div className="ws-tree">
            {renderTree(
              tree.filter((item) => {
                if (appMode === "product") {
                  // News/Product mode: only show Template Setup
                  return item.id === "tmpl-folder";
                }
                // Personal mode: show everything EXCEPT Template Setup
                return item.id !== "tmpl-folder";
              }),
            )}
          </div>
        </div>

        <div className="ws-sidebar-footer">
          <div className="ws-profile">
            <div className="ws-avatar" aria-hidden="true">{userAvatarLabel}</div>
            <div className="ws-profile-meta">
              <p className="ws-profile-name">{userDisplayName}</p>
              <p className="ws-profile-role">{signedInEmail}</p>
            </div>
          </div>
          <div className="ws-profile-actions" ref={userSettingsRef}>
            <button className="ws-icon-btn" aria-label="Help" type="button">
              <CircleHelp size={15} strokeWidth={1.8} />
            </button>
            <button
              className={`ws-icon-btn${userSettingsOpen ? " ws-icon-btn-active" : ""}`}
              aria-label="Workspace user settings"
              type="button"
              aria-expanded={userSettingsOpen}
              onClick={() => setUserSettingsOpen((open) => !open)}
            >
              <Settings size={15} strokeWidth={1.8} />
            </button>
            {userSettingsOpen ? (
              <div className="ws-user-settings-menu" role="menu" aria-label="Workspace user settings">
                <div className="ws-user-settings-head">
                  <div className="ws-avatar ws-user-settings-avatar" aria-hidden="true">{userAvatarLabel}</div>
                  <div className="ws-user-settings-copy">
                    <span className="ws-user-settings-name">{userDisplayName}</span>
                    <span className="ws-user-settings-email">{signedInEmail}</span>
                  </div>
                </div>
                <div className="ws-user-settings-divider" />
                <button className="ws-user-settings-item" type="button" role="menuitem" onClick={handleSwitchAccount}>
                  <User size={13} strokeWidth={1.8} className="ws-user-settings-item-icon" aria-hidden="true" />
                  Switch account
                </button>
                <button className="ws-user-settings-item ws-user-settings-item-danger" type="button" role="menuitem" onClick={handleSignOut}>
                  <Lock size={13} strokeWidth={1.8} className="ws-user-settings-item-icon" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : null}
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
            {view !== "graph" && (
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
            {/* Mode navigation */}
            <div className="ws-topbar-modes">
              <button
                className={`ws-topbar-mode-tab${appMode === "product" && graphLayer === "news" ? " ws-topbar-mode-tab-active" : ""}`}
                onClick={() => { setAppMode("product"); setGraphLayer("news"); }}
                type="button"
              >
                <Newspaper size={12} strokeWidth={2} />
                News
              </button>
              <button
                className={`ws-topbar-mode-tab${graphLayer === "deals" ? " ws-topbar-mode-tab-active" : ""}`}
                onClick={() => { setGraphLayer("deals"); setView("deals"); }}
                type="button"
              >
                <TrendingUp size={12} strokeWidth={2} />
                Deals
              </button>
              <button
                className={`ws-topbar-mode-tab${appMode === "personal" ? " ws-topbar-mode-tab-active" : ""}`}
                onClick={() => { setAppMode("personal"); setGraphLayer("personal"); }}
                type="button"
              >
                <User size={12} strokeWidth={2} />
                Personal
              </button>
            </div>

            {/* Breadcrumb when on a page */}
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
            {/* Graph search overlay */}
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
                  const r = baseR * nodeSize;

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
                        clearTimeout(nodeHoverClearTimer.current);
                        setHoveredNodeId(page.id);
                        setGraphHighlightId(page.id);
                      }}
                      onMouseLeave={() => {
                        nodeHoverClearTimer.current = setTimeout(() => {
                          if (!isHoveringPreviewRef.current) {
                            setHoveredNodeId(null);
                            setGraphHighlightId(null);
                          }
                        }, 80);
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
                          style={{ transition: "opacity 150ms ease" }}
                        />
                      )}
                      <circle
                        r={r}
                        fill={fill}
                        style={{ transition: "fill 150ms ease" }}
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

            {/* Node hover preview card — positioned near the hovered node */}
            {(() => {
              if (!hoveredNodeId) return null;
              const pg = pages[hoveredNodeId];
              if (!pg) return null;

              // Compute screen position of the node
              const simNode = nodePositions.get(hoveredNodeId);
              const canvas = canvasRef.current;
              const t = transform;
              let cardLeft: number | undefined;
              let cardTop: number | undefined;
              let anchorRight = false;

              if (simNode && canvas) {
                const canvasRect = canvas.getBoundingClientRect();
                const nodeScreenX = t.x + simNode.x * t.scale;
                const nodeScreenY = t.y + simNode.y * t.scale;
                const CARD_W = 260;
                const CARD_H = 220;
                const GAP = 16;
                // Place to the right if room, else to the left
                if (nodeScreenX + GAP + CARD_W < canvasRect.width) {
                  cardLeft = nodeScreenX + GAP;
                } else {
                  cardLeft = nodeScreenX - GAP - CARD_W;
                  anchorRight = true;
                }
                // Clamp vertically
                const rawTop = nodeScreenY - CARD_H / 2;
                cardTop = Math.max(8, Math.min(canvasRect.height - CARD_H - 8, rawTop));
              }

              const groupColor = nodeGroupMap.get(hoveredNodeId);
              const isProduct = tmplPageIds.has(hoveredNodeId) || guidePageIds.has(hoveredNodeId);
              const isSaveable = tmplPageIds.has(hoveredNodeId);

              return (
                <div
                  className="ws-graph-preview"
                  key={hoveredNodeId}
                  style={cardLeft !== undefined ? { left: cardLeft, top: cardTop, right: "auto", transform: "none" } : undefined}
                  data-anchor-right={anchorRight}
                  onMouseEnter={() => {
                    clearTimeout(nodeHoverClearTimer.current);
                    isHoveringPreviewRef.current = true;
                  }}
                  onMouseLeave={() => {
                    isHoveringPreviewRef.current = false;
                    setHoveredNodeId(null);
                    setGraphHighlightId(null);
                  }}
                >
                  {/* Hero area */}
                  <div
                    className="ws-graph-preview-hero"
                    style={{
                      background: groupColor
                        ? `linear-gradient(135deg, ${groupColor}22 0%, ${groupColor}44 100%)`
                        : "linear-gradient(135deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.08) 100%)",
                    }}
                  >
                    {pg.icon ? (
                      <span className="ws-graph-preview-icon">{pg.icon}</span>
                    ) : (
                      <span className="ws-graph-preview-icon ws-graph-preview-icon-placeholder">
                        {pg.title?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    )}
                    {isProduct && (
                      <span className="ws-graph-preview-badge">
                        <Lock size={9} strokeWidth={2.5} /> {guidePageIds.has(hoveredNodeId) ? "Guide" : "Published"}
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div className="ws-graph-preview-body">
                    <h3 className="ws-graph-preview-title">{pg.title || "Untitled"}</h3>

                    {/* Tags */}
                    {(pg.tags ?? []).length > 0 && (
                      <div className="ws-graph-preview-tags">
                        {(pg.tags ?? []).slice(0, 6).map((t) => (
                          <span
                            key={t}
                            className="ws-graph-preview-tag"
                            style={groupColor ? { borderColor: `${groupColor}55`, color: groupColor } : undefined}
                          >
                            {t}
                          </span>
                        ))}
                        {(pg.tags ?? []).length > 6 && (
                          <span className="ws-graph-preview-tag ws-graph-preview-tag-more">
                            +{(pg.tags ?? []).length - 6}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="ws-graph-preview-actions">
                      <button
                        className="ws-graph-preview-open"
                        onClick={() => {
                          if (tmplPageIds.has(hoveredNodeId)) {
                            setAppMode("product");
                          } else if (!guidePageIds.has(hoveredNodeId)) {
                            setAppMode("personal");
                          }
                          openPage(hoveredNodeId);
                        }}
                        type="button"
                      >
                        Open →
                      </button>
                      {isSaveable && (
                        <button
                          className="ws-graph-preview-save"
                          onClick={() => savePageToPersonal(hoveredNodeId)}
                          type="button"
                          title="Save a copy to your personal workspace"
                        >
                          <Bookmark size={12} strokeWidth={2} />
                          Save
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {view === "library" && (
          <div className="ws-library">
            <div className="ws-library-inner">
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="ws-page-pdf-input"
                onChange={handlePdfUpload}
              />

              {pdfUploadError ? (
                <p className="ws-page-pdf-error" role="status">
                  {pdfUploadError}
                </p>
              ) : pdfUploadStatus ? (
                <p className="ws-page-pdf-status" role="status">
                  {pdfUploadStatus}
                </p>
              ) : null}

              {sharedPdfList.length ? (
                <div className="ws-library-grid">
                  {sharedPdfList.map((pdf) => (
                    <article
                      key={pdf.id}
                      className={`ws-library-card${selectedPdfId === pdf.id ? " is-selected" : ""}`}
                      onClick={() => { setSelectedPdfId(pdf.id === selectedPdfId ? null : pdf.id); setPdfAssignmentQuery(""); }}
                    >
                      <div className="ws-library-card-head">
                        <button
                          className="ws-library-assign-plus"
                          onClick={(e) => { e.stopPropagation(); setSelectedPdfId(pdf.id); setPdfAssignmentQuery(""); }}
                          type="button"
                          aria-label="Assign PDF to pages"
                        >
                          <Plus size={13} strokeWidth={2.1} />
                        </button>
                        <h2 className="ws-library-card-title">{pdf.name}</h2>
                        <button
                          className="ws-library-remove"
                          onClick={(e) => { e.stopPropagation(); removeSharedPdf(pdf.id); }}
                          type="button"
                          aria-label="Remove PDF"
                        >
                          <Trash2 size={13} strokeWidth={1.9} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="ws-library-empty-state">
                  <p>No PDFs uploaded yet.</p>
                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf"
                    multiple
                    className="ws-page-pdf-input"
                    onChange={handlePdfUpload}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => pdfInputRef.current?.click()}
                    type="button"
                    disabled={pdfUploading}
                  >
                    <Upload size={14} strokeWidth={1.8} />
                    Upload your PDFs
                  </button>
                </div>
              )}
            </div>
          </div>
        )}


        {/* ── Deal Tracker view ── */}
        {view === "deals" && (() => {
          const dealList = Object.values(deals).sort((a, b) => b.createdAt - a.createdAt);
          const activeDeal = selectedDealId ? deals[selectedDealId] : null;

          const DEAL_TYPES: DealType[] = ["Mergers & Acquisitions", "Leveraged Buyout", "Initial Public Offering", "Equity Capital Markets", "Debt Capital Markets", "Private Equity", "Venture Capital", "Fundraising", "Exit", "Other"];
          const STATUS_META: Record<DealStatus, { label: string; color: string }> = {
            rumored:    { label: "Rumored",    color: "#9b8ab5" },
            announced:  { label: "Announced",  color: "#4a90d9" },
            pending:    { label: "Pending",    color: "#d4a017" },
            completed:  { label: "Completed",  color: "#3aaa6e" },
            terminated: { label: "Terminated", color: "#c94040" },
          };
          const filteredDealList = dealList.filter((d) => dealStatusFilter === "all" || d.status === dealStatusFilter);
          const dealMetrics = [
            { label: "Tracked deals", value: String(dealList.length) },
            { label: "Live pipeline", value: String(dealList.filter((d) => d.status === "announced" || d.status === "pending").length) },
            { label: "Completed", value: String(dealList.filter((d) => d.status === "completed").length) },
          ];

          return (
            <div className="ws-deals">
              {/* Header */}
              <div className="ws-deals-header">
                <div className="ws-deals-header-copy">
                  <div className="ws-deals-title-row">
                    <TrendingUp size={16} strokeWidth={1.8} />
                    <h1 className="ws-deals-title">Deal Tracker</h1>
                    <span className="ws-deals-count">{dealList.length}</span>
                  </div>
                  <p className="ws-deals-subtitle">
                    Track live situations, keep structured metadata clean, and jump straight into linked notes when a deal needs real work.
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  type="button"
                  onClick={() => addDeal()}
                >
                  <Plus size={13} strokeWidth={2.2} />
                  New Deal
                </button>
              </div>

              <div className="ws-deals-overview">
                {dealMetrics.map((metric) => (
                  <div className="ws-deals-overview-card" key={metric.label}>
                    <span className="ws-deals-overview-label">{metric.label}</span>
                    <strong className="ws-deals-overview-value">{metric.value}</strong>
                  </div>
                ))}
              </div>

              {/* Status filter pills */}
              <div className="ws-deals-filters">
                {(["all", ...Object.keys(STATUS_META)] as const).map((s) => (
                  <button
                    key={s}
                    className={`ws-deals-filter-pill${dealStatusFilter === s || (dealStatusFilter === "all" && s === "all") ? " ws-deals-filter-pill-active" : ""}`}
                    type="button"
                    onClick={() => setDealStatusFilter(s === "all" ? "all" : s as DealStatus)}
                  >
                    {s === "all" ? "All" : STATUS_META[s as DealStatus].label}
                    <span className="ws-deals-filter-count">
                      {s === "all" ? dealList.length : dealList.filter((d) => d.status === s).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="ws-deals-body">
                {/* Deal grid */}
                <div className="ws-deals-grid">
                  {dealList.length === 0 ? (
                    <div className="ws-deals-empty">
                      <TrendingUp size={28} strokeWidth={1.3} />
                      <p>No deals tracked yet.</p>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={() => addDeal()}>
                        <Plus size={13} strokeWidth={2.2} />
                        Add your first deal
                      </button>
                    </div>
                  ) : filteredDealList.map((deal) => {
                    const meta = STATUS_META[deal.status];
                    const isActive = selectedDealId === deal.id;
                    return (
                      <article
                        key={deal.id}
                        className={`ws-deal-card${isActive ? " ws-deal-card-active" : ""}`}
                        onClick={() => {
                          if (deal.linkedPageId && pages[deal.linkedPageId]) {
                            openPage(deal.linkedPageId);
                          } else {
                            setSelectedDealId(isActive ? null : deal.id);
                            setDealForm(isActive ? null : { ...deal });
                          }
                        }}
                      >
                        {/* Left accent bar */}
                        <div className="ws-deal-card-status-bar" style={{ background: meta.color }} />

                        <div className="ws-deal-card-inner">
                          {/* Type + date */}
                          <div className="ws-deal-card-top-meta">
                            <span className="ws-deal-type-badge">{deal.type}</span>
                            {deal.date ? <span className="ws-deal-date ws-deal-date-inline">{deal.date}</span> : null}
                          </div>

                          {/* Name */}
                          <h3 className="ws-deal-name">{deal.name}</h3>

                          {/* Acquirer → Target */}
                          {(deal.acquirer || deal.target) ? (
                            <div className="ws-deal-firms">
                              {deal.acquirer ? <span className="ws-deal-firm ws-deal-firm-buyer">{deal.acquirer}</span> : null}
                              {deal.acquirer && deal.target ? (
                                <ArrowUpRight size={10} strokeWidth={2.5} className="ws-deal-arrow" />
                              ) : null}
                              {deal.target ? <span className="ws-deal-firm ws-deal-firm-target">{deal.target}</span> : null}
                            </div>
                          ) : null}

                          {/* Tags: sector */}
                          {deal.sector ? (
                            <div className="ws-deal-card-footer">
                              <span className="ws-deal-sector">{deal.sector}</span>
                              {deal.advisors ? <span className="ws-deal-sector">{deal.advisors}</span> : null}
                            </div>
                          ) : null}
                        </div>

                        {/* Right side: status + amount + CTA */}
                        <div className="ws-deal-card-right">
                          <span className="ws-deal-status-pill" style={{ color: meta.color, background: `${meta.color}18` }}>
                            {meta.label}
                          </span>
                          {deal.amount ? <span className="ws-deal-amount">{deal.amount}</span> : null}
                          {deal.linkedPageId && pages[deal.linkedPageId] ? (
                            <div className="ws-deal-card-cta">
                              <ArrowUpRight size={10} strokeWidth={2} />
                              Notes
                            </div>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Edit drawer — slides in over the right side when no linked page, or used for editing */}
                {activeDeal && dealForm ? (
                  <aside className="ws-deal-drawer">
                    {/* Drawer header */}
                    <div className="ws-deal-drawer-header">
                      <div className="ws-deal-drawer-title-row">
                        <span className="ws-deal-drawer-label">Edit deal</span>
                        <div className="ws-deal-drawer-actions">
                          {activeDeal.linkedPageId && pages[activeDeal.linkedPageId] && (
                            <button
                              className="btn btn-primary btn-sm"
                              type="button"
                              onClick={() => openPage(activeDeal.linkedPageId!)}
                            >
                              <ArrowUpRight size={12} strokeWidth={2} />
                              Open notes
                            </button>
                          )}
                          <button
                            className="ws-icon-btn"
                            type="button"
                            onClick={() => removeDeal(activeDeal.id)}
                            aria-label="Delete deal"
                            title="Delete deal"
                          >
                            <Trash2 size={13} strokeWidth={1.9} />
                          </button>
                          <button
                            className="ws-icon-btn"
                            type="button"
                            onClick={() => { setSelectedDealId(null); setDealForm(null); }}
                            aria-label="Close"
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                      </div>
                      {/* Status progress bar */}
                      <div className="ws-deal-status-track">
                        {(Object.entries(STATUS_META) as [DealStatus, { label: string; color: string }][]).filter(([s]) => s !== "terminated").map(([s, m]) => (
                          <button
                            key={s}
                            className={`ws-deal-status-step${activeDeal.status === s ? " ws-deal-status-step-active" : ""}`}
                            style={activeDeal.status === s ? { borderColor: m.color, color: m.color } : {}}
                            type="button"
                            onClick={() => {
                              setDealForm((f) => f ? { ...f, status: s } : f);
                              updateDeal(activeDeal.id, { status: s });
                            }}
                          >
                            {m.label}
                          </button>
                        ))}
                        <button
                          className={`ws-deal-status-step ws-deal-status-step-terminated${activeDeal.status === "terminated" ? " ws-deal-status-step-active" : ""}`}
                          style={activeDeal.status === "terminated" ? { borderColor: STATUS_META.terminated.color, color: STATUS_META.terminated.color } : {}}
                          type="button"
                          onClick={() => {
                            setDealForm((f) => f ? { ...f, status: "terminated" } : f);
                            updateDeal(activeDeal.id, { status: "terminated" });
                          }}
                        >
                          Terminated
                        </button>
                      </div>
                    </div>

                    <div className="ws-deal-drawer-body">
                      {/* Deal name */}
                      <div className="ws-deal-field-group">
                        <span className="ws-deal-field-label">Deal name</span>
                        <input
                          className="ws-deal-field-input ws-deal-field-input-lg"
                          value={dealForm.name ?? ""}
                          placeholder="Deal name"
                          onChange={(e) => setDealForm((f) => f ? { ...f, name: e.target.value } : f)}
                          onBlur={() => updateDeal(activeDeal.id, { name: dealForm.name })}
                        />
                      </div>

                      {/* Type */}
                      <div className="ws-deal-field-group">
                        <span className="ws-deal-field-label">Type</span>
                        <select
                          className="ws-deal-field-select"
                          value={dealForm.type ?? "Mergers & Acquisitions"}
                          onChange={(e) => {
                            const v = e.target.value as DealType;
                            setDealForm((f) => f ? { ...f, type: v } : f);
                            updateDeal(activeDeal.id, { type: v });
                          }}
                        >
                          {DEAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>

                      {/* Amount + Sector */}
                      <div className="ws-deal-field-row">
                        <div className="ws-deal-field-group">
                          <span className="ws-deal-field-label">Amount</span>
                          <input
                            className="ws-deal-field-input"
                            placeholder="e.g. $3.9bn"
                            value={dealForm.amount ?? ""}
                            onChange={(e) => setDealForm((f) => f ? { ...f, amount: e.target.value } : f)}
                            onBlur={() => updateDeal(activeDeal.id, { amount: dealForm.amount })}
                          />
                        </div>
                        <div className="ws-deal-field-group">
                          <span className="ws-deal-field-label">Sector</span>
                          <input
                            className="ws-deal-field-input"
                            placeholder="e.g. Healthcare"
                            value={dealForm.sector ?? ""}
                            onChange={(e) => setDealForm((f) => f ? { ...f, sector: e.target.value } : f)}
                            onBlur={() => updateDeal(activeDeal.id, { sector: dealForm.sector })}
                          />
                        </div>
                      </div>

                      {/* Acquirer + Target */}
                      <div className="ws-deal-field-row">
                        <div className="ws-deal-field-group">
                          <span className="ws-deal-field-label">Acquirer / Buyer</span>
                          <input
                            className="ws-deal-field-input"
                            placeholder="e.g. Blackstone"
                            value={dealForm.acquirer ?? ""}
                            onChange={(e) => setDealForm((f) => f ? { ...f, acquirer: e.target.value } : f)}
                            onBlur={() => updateDeal(activeDeal.id, { acquirer: dealForm.acquirer })}
                          />
                        </div>
                        <div className="ws-deal-field-group">
                          <span className="ws-deal-field-label">Target / Issuer</span>
                          <input
                            className="ws-deal-field-input"
                            placeholder="e.g. Sigma Healthcare"
                            value={dealForm.target ?? ""}
                            onChange={(e) => setDealForm((f) => f ? { ...f, target: e.target.value } : f)}
                            onBlur={() => updateDeal(activeDeal.id, { target: dealForm.target })}
                          />
                        </div>
                      </div>

                      {/* Advisors */}
                      <div className="ws-deal-field-group">
                        <span className="ws-deal-field-label">Advisors</span>
                        <input
                          className="ws-deal-field-input"
                          placeholder="e.g. Goldman Sachs, J.P. Morgan"
                          value={dealForm.advisors ?? ""}
                          onChange={(e) => setDealForm((f) => f ? { ...f, advisors: e.target.value } : f)}
                          onBlur={() => updateDeal(activeDeal.id, { advisors: dealForm.advisors })}
                        />
                      </div>

                      {/* Date */}
                      <div className="ws-deal-field-group">
                        <span className="ws-deal-field-label">Date</span>
                        <input
                          className="ws-deal-field-input"
                          type="date"
                          value={dealForm.date ?? ""}
                          onChange={(e) => {
                            setDealForm((f) => f ? { ...f, date: e.target.value } : f);
                            updateDeal(activeDeal.id, { date: e.target.value });
                          }}
                        />
                      </div>
                    </div>
                  </aside>
                ) : null}
              </div>
            </div>
          );
        })()}

        {/* ── Page view ── */}
        {view === "page" &&
          (selectedPage ? (
            <div className="ws-page">
              <div className="ws-page-inner">
                <div className="ws-page-icon-row">
                  {selectedPage.icon ? (
                    <button
                      className="ws-page-icon"
                      onClick={(event) => selectedId && !isProductPage(selectedId) && openIconPicker(event, selectedId)}
                      type="button"
                      aria-label={isProductPage(selectedId ?? "") ? undefined : "Change icon"}
                      style={selectedPage.iconColor ? { background: resolveIconBg(selectedPage.iconColor) } : undefined}
                    >
                      {selectedPage.icon}
                    </button>
                  ) : (
                    !isProductPage(selectedId ?? "") && (
                      <button
                        className="ws-page-icon-add"
                        onClick={(event) => selectedId && openIconPicker(event, selectedId)}
                        type="button"
                      >
                        <Smile size={15} strokeWidth={1.8} />
                        <span>Add icon</span>
                      </button>
                    )
                  )}
                </div>

                {selectedId && isProductPage(selectedId) && (
                  <div className="ws-page-product-banner">
                    <Lock size={11} strokeWidth={2.5} />
                    <span>{guidePageIds.has(selectedId) ? "Guide content — read only" : "Published content — read only"}</span>
                    {tmplPageIds.has(selectedId) && (
                      <button
                        className="ws-page-product-save-btn"
                        onClick={() => selectedId && savePageToPersonal(selectedId)}
                        type="button"
                      >
                        <Bookmark size={11} strokeWidth={2} />
                        Save to My Workspace
                      </button>
                    )}
                  </div>
                )}

                <h1
                  ref={titleRef}
                  className="ws-page-title"
                  contentEditable={!(selectedId && isProductPage(selectedId))}
                  suppressContentEditableWarning
                  onInput={(e) => {
                    if (selectedId && !isProductPage(selectedId))
                      updatePage(selectedId, {
                        title: e.currentTarget.textContent ?? "Untitled",
                      });
                  }}
                  onBlur={(e) => {
                    if (selectedId && !isProductPage(selectedId))
                      updatePage(selectedId, {
                        title: e.currentTarget.textContent?.trim() || "Untitled",
                      });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      bodyRef.current?.focus();
                    }
                  }}
                  data-placeholder="Untitled"
                />

                {/* Tags */}
                <div className="ws-page-tags" ref={tagMenuRef}>
                  {selectedPage.tags?.map((tag) => (
                    <span key={tag} className="ws-page-tag-pill">
                      {tag}
                      {!(selectedId && isProductPage(selectedId)) && (
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
                      )}
                    </span>
                  ))}
                  {!(selectedId && isProductPage(selectedId)) && <div className="ws-page-tag-add-wrap">
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
                                addTagToSelectedPage(tagInput);
                                setAddingTag(false);
                              }
                              if (e.key === "Escape") setAddingTag(false);
                            }}
                          />
                        </div>

                        {/* Existing tags — only shown when user is typing */}
                        {tagInput.trim() &&
                          availableTags
                            .filter((t) => !selectedPage.tags?.includes(t))
                            .filter((t) => t.toLowerCase().includes(tagInput.toLowerCase()))
                            .map((tag) => (
                              <button
                                key={tag}
                                className="ws-page-tag-option"
                                onClick={() => {
                                  addTagToSelectedPage(tag);
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
                            (t) => t.toLowerCase() === normalizeTagLabel(tagInput).toLowerCase(),
                          ) && (
                            <button
                              className="ws-page-tag-option ws-page-tag-create"
                              onClick={() => {
                                addTagToSelectedPage(tagInput);
                                setAddingTag(false);
                              }}
                              type="button"
                              role="option"
                              aria-selected={false}
                            >
                              <Plus size={11} strokeWidth={2.2} />
                              Create &ldquo;{normalizeTagLabel(tagInput)}&rdquo;
                            </button>
                          )}

                        {/* Prompt when no search yet */}
                        {!tagInput.trim() && (
                          <span className="ws-page-tag-empty">Type to search or create a tag</span>
                        )}
                      </div>
                    )}
                  </div>}
                </div>

                {pdfUploadError ? (
                  <p className="ws-page-pdf-error" role="status">
                    {pdfUploadError}
                  </p>
                ) : pdfUploadStatus ? (
                  <p className="ws-page-pdf-status" role="status">
                    {pdfUploadStatus}
                  </p>
                ) : null}

                <div
                  className={`ws-page-body-wrap${isBodyDropActive ? " ws-page-body-wrap-drop" : ""}`}
                >
                  <div
                    ref={bodyRef}
                    className={`ws-page-body${selectedId && isProductPage(selectedId) ? " ws-page-body-readonly" : ""}`}
                    contentEditable={!(selectedId && isProductPage(selectedId))}
                    suppressContentEditableWarning
                    onBlur={saveCurrentBody}
                    onClick={handleBodyClick}
                    onDragLeave={handleBodyDragLeave}
                    onDragOver={handleBodyDragOver}
                    onDrop={handleBodyDrop}
                    onInput={handleBodyInput}
                    onKeyDown={handleBodyKeyDown}
                    onKeyUp={handleBodyKeyUp}
                    onMouseUp={handleBodyMouseUp}
                    data-placeholder="Start writing, or press '/' for commands…"
                  />

                  {slashMenu && (slashCommands.length > 0 || slashMenu.mode === "ai-prompt") ? (
                    <div
                      ref={slashMenuRef}
                      className={`ws-slash-menu${slashMenu.mode === "ai-prompt" ? " ws-slash-menu-ai" : ""}`}
                      style={{ left: slashMenu.left, top: slashMenu.top }}
                      role="listbox"
                    >
                      {(slashMenu.mode === "link-page" || slashMenu.mode === "pdf-pick" || slashMenu.mode === "ai-prompt") ? (
                        <div className="ws-slash-header">
                          <button
                            className="ws-slash-back"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              setSlashMenu((prev) =>
                                prev ? { ...prev, mode: "root", query: "" } : prev,
                              );
                              setLinkPageQuery("");
                              setPdfPickQuery("");
                              setAiPromptInput("");
                              setAiPromptError(null);
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
                          <span className="ws-slash-header-title">
                            {slashMenu.mode === "pdf-pick" ? "Insert PDF" : slashMenu.mode === "ai-prompt" ? "Ask AI" : "Link Page"}
                          </span>
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

                      {slashMenu.mode === "pdf-pick" ? (
                        <div className="ws-slash-search">
                          <input
                            ref={slashSearchRef}
                            className="ws-slash-search-input"
                            placeholder="Search PDFs in your library…"
                            value={pdfPickQuery}
                            onChange={(event) => {
                              setPdfPickQuery(event.target.value);
                              setSlashCmdIdx(0);
                            }}
                            onKeyDown={handleSlashSearchKeyDown}
                          />
                        </div>
                      ) : null}

                      {slashMenu.mode === "pdf-pick" && slashCommands.length === 0 ? (
                        <p className="ws-slash-empty">
                          {sharedPdfList.length === 0
                            ? "No PDFs in your library yet. Upload one from the Library tab."
                            : "No PDFs are assigned to this page yet. Assign one from the Library tab first."}
                        </p>
                      ) : null}

                      {slashMenu.mode === "ai-prompt" ? (
                        <div className="ws-slash-ai-prompt">
                          <div className="ws-slash-ai-input-row">
                            <input
                              ref={aiPromptInputRef}
                              className="ws-slash-search-input"
                              placeholder="What should Arthur write or add to this page?"
                              value={aiPromptInput}
                              disabled={aiPromptLoading}
                              onChange={(e) => { setAiPromptInput(e.target.value); setAiPromptError(null); }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); sendAiWrite(); }
                                if (e.key === "Escape") { e.preventDefault(); closeSlashMenu(); }
                              }}
                            />
                            <button
                              className="ws-slash-ai-send"
                              type="button"
                              disabled={aiPromptLoading || !aiPromptInput.trim()}
                              onMouseDown={(e) => { e.preventDefault(); sendAiWrite(); }}
                              aria-label="Send to Arthur"
                            >
                              {aiPromptLoading ? (
                                <span className="ws-slash-ai-spinner" aria-hidden="true" />
                              ) : (
                                <Send size={12} strokeWidth={2} />
                              )}
                            </button>
                          </div>
                          <div className="ws-slash-ai-footer">
                            {aiPromptLoading ? (
                              <>
                                <span className="ws-slash-ai-spinner" aria-hidden="true" />
                                <p className="ws-slash-ai-status">Arthur is writing…</p>
                              </>
                            ) : aiPromptError ? (
                              <p className="ws-slash-ai-error">{aiPromptError}</p>
                            ) : (
                              <p className="ws-slash-ai-hint">Enter to write · Esc to cancel</p>
                            )}
                          </div>
                        </div>
                      ) : null}

                      {slashMenu.mode !== "ai-prompt" ? slashCommands.reduce<React.ReactNode[]>((acc, command, index) => {
                        const prevGroup = index > 0 ? slashCommands[index - 1].group : undefined;
                        if (slashMenu.mode === "root" && command.group && command.group !== prevGroup) {
                          acc.push(
                            <div key={`grp-${command.group}`} className="ws-slash-group-label">
                              {command.group}
                            </div>,
                          );
                        }
                        acc.push(
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
                          </button>,
                        );
                        return acc;
                      }, []) : null}
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

            {arthurStatus ? (
              <div className="ws-arthur-status" role="status">
                {arthurStatus}
              </div>
            ) : null}

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
                  <div className="ws-arthur-msg-bubble">
                    {msg.text}
                  </div>
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

            {arthurError ? (
              <p className="ws-arthur-context" role="status">
                {arthurError}
              </p>
            ) : null}

            <div className="ws-arthur-input-row">
              <input
                className="ws-arthur-input"
                placeholder="Ask Arthur…"
                value={arthurInput}
                onChange={(e) => setArthurInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendArthur();
                }}
                disabled={arthurTyping}
                aria-label="Message Arthur"
              />
              <button
                className="ws-arthur-send"
                onClick={sendArthur}
                disabled={!arthurInput.trim() || arthurTyping}
                type="button"
                aria-label="Send message"
              >
                <Send size={13} strokeWidth={2} />
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {iconPicker ? (
        <div
          ref={iconPickerRef}
          className="ws-icon-picker"
          style={{ top: iconPicker.top, left: iconPicker.left }}
          role="dialog"
          aria-label="Page icon picker"
        >
          {/* Search */}
          <div className="ws-ip-search-row">
            <input
              ref={iconInputRef}
              className="ws-ip-search"
              placeholder="Search icons…"
              value={iconPickerSearch}
              onChange={(e) => setIconPickerSearch(e.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {/* Color swatches */}
          <div className="ws-ip-colors">
            {ICON_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={`ws-ip-color-swatch${iconPicker.selectedColor === c.value ? " ws-ip-color-swatch-active" : ""}`}
                style={c.bg ? { background: c.bg } : undefined}
                aria-label={c.label}
                onMouseDown={(e) => { e.preventDefault(); setIconPickerColor(c.value); }}
              />
            ))}
          </div>

          {/* Emoji grid */}
          <div className="ws-ip-grid-wrap">
            {PICKER_EMOJI_CATEGORIES.map((cat) => {
              const q = iconPickerSearch.trim().toLowerCase();
              const items = q
                ? cat.items.filter((item) => item.label.includes(q) || cat.cat.toLowerCase().includes(q))
                : cat.items;
              if (items.length === 0) return null;
              return (
                <div key={cat.cat}>
                  {!q && <p className="ws-ip-cat-label">{cat.cat}</p>}
                  <div className="ws-ip-grid">
                    {items.map((item) => (
                      <button
                        key={item.emoji}
                        type="button"
                        className="ws-ip-emoji-btn"
                        onMouseDown={(e) => { e.preventDefault(); applyPageIcon(iconPicker.pageId, item.emoji); }}
                        aria-label={item.label}
                      >
                        {item.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Remove */}
          <button
            className="ws-ip-remove"
            onMouseDown={(e) => { e.preventDefault(); applyPageIcon(iconPicker.pageId, ""); }}
            type="button"
          >
            Remove icon
          </button>
        </div>
      ) : null}


      {/* Floating format toolbar — hidden on product/read-only pages */}
      {formatBar && view === "page" && !(selectedId && isProductPage(selectedId)) ? (
        <div
          ref={formatBarRef}
          className="ws-format-bar"
          style={{ left: formatBar.x, top: formatBar.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button className="ws-fmt-btn ws-fmt-b" onMouseDown={() => handleFormatCmd("bold")} type="button" title="Bold (Ctrl+B)">B</button>
          <button className="ws-fmt-btn ws-fmt-i" onMouseDown={() => handleFormatCmd("italic")} type="button" title="Italic (Ctrl+I)">I</button>
          <button className="ws-fmt-btn ws-fmt-u" onMouseDown={() => handleFormatCmd("underline")} type="button" title="Underline (Ctrl+U)">U</button>
          <button className="ws-fmt-btn ws-fmt-s" onMouseDown={() => handleFormatCmd("strikeThrough")} type="button" title="Strikethrough (Ctrl+Shift+S)">S</button>
          <span className="ws-fmt-sep" />
          <button className="ws-fmt-btn ws-fmt-code" onMouseDown={(e) => { e.preventDefault(); bodyRef.current?.focus(); wrapInlineCode(); saveCurrentBody(); setTimeout(updateFormatBar, 0); }} type="button" title="Inline code (Ctrl+E)">{"{}"}</button>
          <span className="ws-fmt-sep" />
          <button className="ws-fmt-btn ws-fmt-clear" onMouseDown={() => { handleFormatCmd("removeFormat"); setFormatBar(null); }} type="button" title="Clear formatting">✕</button>
        </div>
      ) : null}

      {/* PDF Detail Panel */}
      <aside className={`ws-pdf-detail${view === "library" && selectedPdfId && sharedPdfs[selectedPdfId] ? " is-open" : ""}`} aria-label="PDF details">
        {selectedPdfId && sharedPdfs[selectedPdfId] ? (() => {
          const pdf = sharedPdfs[selectedPdfId];
          const unassignedOptions = allPages.filter((page) => {
            const label = pages[page.id]?.title ?? page.label;
            const matchesQuery = !pdfAssignmentQuery || label.toLowerCase().includes(pdfAssignmentQuery.toLowerCase());
            return matchesQuery && !pdf.assignedPageIds.includes(page.id);
          });

          return (
            <>
              <div className="ws-pdf-detail-header">
                <div className="ws-pdf-detail-title-wrap">
                  <FileText size={14} strokeWidth={1.8} className="ws-pdf-detail-icon" />
                  <span className="ws-pdf-detail-title">{pdf.name}</span>
                </div>
                <button
                  className="ws-pdf-detail-close"
                  onClick={() => setSelectedPdfId(null)}
                  type="button"
                  aria-label="Close panel"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>

              <div className="ws-pdf-detail-body">
                <p className="ws-pdf-detail-section-label">Pages with access</p>
                <div className="ws-pdf-detail-assigned">
                  {pdf.assignedPageIds.length ? (
                    pdf.assignedPageIds.map((pageId) => {
                      const label = pages[pageId]?.title ?? allPages.find((p) => p.id === pageId)?.label ?? "Page";
                      return (
                        <div key={pageId} className="ws-pdf-detail-page-row">
                          <span className="ws-pdf-detail-page-name">{label}</span>
                          <button
                            className="ws-pdf-detail-remove-page"
                            onClick={() => togglePdfAssignment(selectedPdfId, pageId)}
                            type="button"
                            aria-label={`Remove ${label}`}
                          >
                            <X size={11} strokeWidth={2.2} />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p className="ws-pdf-detail-empty">No pages assigned yet.</p>
                  )}
                </div>

                <p className="ws-pdf-detail-section-label">Add pages</p>
                <input
                  className="ws-pdf-detail-search"
                  placeholder="Search pages…"
                  value={pdfAssignmentQuery}
                  onChange={(e) => setPdfAssignmentQuery(e.target.value)}
                  aria-label="Search pages to add"
                />
                <div className="ws-pdf-detail-add-list">
                  {unassignedOptions.map((page) => {
                    const label = pages[page.id]?.title ?? page.label;
                    return (
                      <button
                        key={page.id}
                        className="ws-pdf-detail-add-btn"
                        onClick={() => togglePdfAssignment(selectedPdfId, page.id)}
                        type="button"
                      >
                        <Plus size={11} strokeWidth={2.2} />
                        {label}
                      </button>
                    );
                  })}
                  {unassignedOptions.length === 0 ? (
                    <span className="ws-pdf-detail-add-empty">
                      {pdfAssignmentQuery ? "No matching pages." : "All pages already assigned."}
                    </span>
                  ) : null}
                </div>
              </div>
            </>
          );
        })() : null}
      </aside>

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
