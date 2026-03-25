import { describe, it, expect } from "vitest";
import {
  getLocalGraphNodeIds,
  getOrphanIds,
  matchGroup,
  getAllPagesFlat,
  filterEdges,
  lerp,
  forceFromNorm,
  sortPagesByDate,
  computeDegrees,
} from "@/lib/graph-utils";
import type { GraphEdge, SidebarItem, PageData } from "@/lib/graph-types";
import type { GraphGroup } from "@/lib/graph-store";

/* ─── Fixtures ─── */

const CHAIN: GraphEdge[] = [
  ["a", "b"],
  ["b", "c"],
  ["c", "d"],
  ["d", "e"],
];

const CIRCLE: GraphEdge[] = [
  ["a", "b"],
  ["b", "c"],
  ["c", "a"],
];

const pageData = (tags: string[], title = "Test Page"): PageData => ({
  title,
  icon: "",
  body: "",
  tags,
  createdAt: 0,
});

/* ─── getLocalGraphNodeIds ─── */

describe("getLocalGraphNodeIds", () => {
  it("depth 0 returns only the center node", () => {
    expect(getLocalGraphNodeIds("b", CHAIN, 0)).toEqual(new Set(["b"]));
  });

  it("depth 1 returns center + immediate neighbors", () => {
    expect(getLocalGraphNodeIds("b", CHAIN, 1)).toEqual(
      new Set(["a", "b", "c"]),
    );
  });

  it("depth 2 returns center + 2-hop neighborhood", () => {
    expect(getLocalGraphNodeIds("b", CHAIN, 2)).toEqual(
      new Set(["a", "b", "c", "d"]),
    );
  });

  it("depth 3 reaches full chain from middle", () => {
    expect(getLocalGraphNodeIds("b", CHAIN, 3)).toEqual(
      new Set(["a", "b", "c", "d", "e"]),
    );
  });

  it("does not exceed the chain even at large depth", () => {
    expect(getLocalGraphNodeIds("b", CHAIN, 100)).toEqual(
      new Set(["a", "b", "c", "d", "e"]),
    );
  });

  it("handles disconnected node gracefully", () => {
    expect(getLocalGraphNodeIds("z", CHAIN, 3)).toEqual(new Set(["z"]));
  });

  it("handles circular references without infinite loop", () => {
    expect(getLocalGraphNodeIds("a", CIRCLE, 10)).toEqual(
      new Set(["a", "b", "c"]),
    );
  });

  it("works with undirected traversal (both edge directions)", () => {
    const edges: GraphEdge[] = [["parent", "child"]];
    // From child should still reach parent
    expect(getLocalGraphNodeIds("child", edges, 1)).toEqual(
      new Set(["child", "parent"]),
    );
  });

  it("depth 1 from head of chain only includes head + first neighbor", () => {
    expect(getLocalGraphNodeIds("a", CHAIN, 1)).toEqual(new Set(["a", "b"]));
  });
});

/* ─── getOrphanIds ─── */

describe("getOrphanIds", () => {
  it("identifies a node that appears in no edge", () => {
    const edges: GraphEdge[] = [["a", "b"]];
    expect(getOrphanIds(["a", "b", "c"], edges)).toEqual(new Set(["c"]));
  });

  it("returns empty set when every node has at least one edge", () => {
    const edges: GraphEdge[] = [["a", "b"], ["b", "c"]];
    expect(getOrphanIds(["a", "b", "c"], edges)).toEqual(new Set());
  });

  it("all nodes are orphans if no edges", () => {
    expect(getOrphanIds(["x", "y", "z"], [])).toEqual(new Set(["x", "y", "z"]));
  });

  it("returns empty set for empty node list", () => {
    expect(getOrphanIds([], CHAIN)).toEqual(new Set());
  });

  it("handles duplicate edge endpoints correctly", () => {
    const edges: GraphEdge[] = [["a", "a"]]; // self-loop
    expect(getOrphanIds(["a", "b"], edges)).toEqual(new Set(["b"]));
  });
});

/* ─── matchGroup ─── */

describe("matchGroup", () => {
  const financeGroup: GraphGroup = {
    id: "1",
    name: "Finance",
    color: "#ff0000",
    query: "finance",
  };
  const techGroup: GraphGroup = {
    id: "2",
    name: "Technology",
    color: "#0000ff",
    query: "technology",
  };

  it("matches by tag (case-insensitive)", () => {
    const pd = pageData(["Finance", "Markets"]);
    const result = matchGroup("p1", pd, [financeGroup]);
    expect(result?.id).toBe("1");
  });

  it("matches by title substring (case-insensitive)", () => {
    const pd = pageData([], "Corporate Finance Overview");
    const result = matchGroup("p1", pd, [financeGroup]);
    expect(result?.id).toBe("1");
  });

  it("returns null when no group matches", () => {
    const pd = pageData(["Policy", "News"]);
    expect(matchGroup("p1", pd, [financeGroup])).toBeNull();
  });

  it("returns null for undefined pageData", () => {
    expect(matchGroup("p1", undefined, [financeGroup])).toBeNull();
  });

  it("first matching group wins (precedence)", () => {
    const pd = pageData(["Finance", "Technology"]);
    expect(matchGroup("p1", pd, [financeGroup, techGroup])?.id).toBe("1");
  });

  it("second group wins when first does not match", () => {
    const pd = pageData(["Technology"]);
    expect(matchGroup("p1", pd, [financeGroup, techGroup])?.id).toBe("2");
  });

  it("empty query group never matches", () => {
    const emptyGroup: GraphGroup = { id: "3", name: "Empty", color: "#000", query: "" };
    const pd = pageData(["Finance"]);
    expect(matchGroup("p1", pd, [emptyGroup])).toBeNull();
  });

  it("whitespace-only query never matches", () => {
    const wsGroup: GraphGroup = { id: "4", name: "WS", color: "#000", query: "   " };
    const pd = pageData(["Finance"]);
    expect(matchGroup("p1", pd, [wsGroup])).toBeNull();
  });
});

/* ─── getAllPagesFlat ─── */

describe("getAllPagesFlat", () => {
  const tree: SidebarItem[] = [
    {
      id: "folder-1",
      label: "Folder",
      type: "folder",
      children: [
        { id: "page-1", label: "Page 1", type: "page" },
        {
          id: "folder-2",
          label: "Sub",
          type: "folder",
          children: [{ id: "page-2", label: "Page 2", type: "page" }],
        },
      ],
    },
    { id: "page-3", label: "Page 3", type: "page" },
  ];

  it("returns all pages regardless of nesting depth", () => {
    const result = getAllPagesFlat(tree);
    expect(result.map((p) => p.id)).toEqual(["page-1", "page-2", "page-3"]);
  });

  it("returns empty array for empty tree", () => {
    expect(getAllPagesFlat([])).toEqual([]);
  });

  it("returns empty array for tree with only folders", () => {
    const folderOnly: SidebarItem[] = [
      { id: "f1", label: "F1", type: "folder", children: [] },
    ];
    expect(getAllPagesFlat(folderOnly)).toEqual([]);
  });
});

/* ─── filterEdges ─── */

describe("filterEdges", () => {
  it("keeps only edges where both endpoints are in the visible set", () => {
    const visible = new Set(["a", "b"]);
    const result = filterEdges(CHAIN, visible);
    expect(result).toEqual([["a", "b"]]);
  });

  it("returns empty array when visible set is empty", () => {
    expect(filterEdges(CHAIN, new Set())).toEqual([]);
  });

  it("returns all edges when all nodes are visible", () => {
    const allIds = new Set(["a", "b", "c", "d", "e"]);
    expect(filterEdges(CHAIN, allIds)).toEqual(CHAIN);
  });
});

/* ─── lerp ─── */

describe("lerp", () => {
  it("returns a at t=0", () => expect(lerp(0, 10, 0)).toBe(0));
  it("returns b at t=1", () => expect(lerp(0, 10, 1)).toBe(10));
  it("returns midpoint at t=0.5", () => expect(lerp(0, 10, 0.5)).toBe(5));
  it("extrapolates beyond range", () => expect(lerp(0, 10, 2)).toBe(20));
});

/* ─── forceFromNorm ─── */

describe("forceFromNorm", () => {
  it("repel: t=0 gives minimum, t=1 gives maximum", () => {
    expect(forceFromNorm.repel(0)).toBeLessThan(forceFromNorm.repel(1));
  });

  it("link: t=0 gives minimum, t=1 gives maximum", () => {
    expect(forceFromNorm.link(0)).toBeLessThan(forceFromNorm.link(1));
  });

  it("distance: t=0 gives minimum (80), t=1 gives maximum (420)", () => {
    expect(forceFromNorm.distance(0)).toBe(80);
    expect(forceFromNorm.distance(1)).toBe(420);
  });

  it("center: t=0 gives minimum, t=1 gives maximum", () => {
    expect(forceFromNorm.center(0)).toBeLessThan(forceFromNorm.center(1));
  });
});

/* ─── sortPagesByDate ─── */

describe("sortPagesByDate", () => {
  const pages: SidebarItem[] = [
    { id: "p1", label: "P1", type: "page" },
    { id: "p2", label: "P2", type: "page" },
    { id: "p3", label: "P3", type: "page" },
  ];

  const pageDataMap: Record<string, PageData> = {
    p1: { title: "P1", icon: "", body: "", tags: [], createdAt: 3000 },
    p2: { title: "P2", icon: "", body: "", tags: [], createdAt: 1000 },
    p3: { title: "P3", icon: "", body: "", tags: [], createdAt: 2000 },
  };

  it("sorts ascending by createdAt", () => {
    const sorted = sortPagesByDate(pages, pageDataMap);
    expect(sorted.map((p) => p.id)).toEqual(["p2", "p3", "p1"]);
  });

  it("does not mutate original array", () => {
    const original = [...pages];
    sortPagesByDate(pages, pageDataMap);
    expect(pages).toEqual(original);
  });

  it("falls back to 0 for missing pageData entries", () => {
    const minimal: Record<string, PageData> = {
      p1: { title: "P1", icon: "", body: "", tags: [], createdAt: 500 },
    };
    const sorted = sortPagesByDate(pages, minimal);
    // p2 and p3 have no data → createdAt=0, come first
    expect(sorted[0].id).not.toBe("p1");
  });
});

/* ─── computeDegrees ─── */

describe("computeDegrees", () => {
  it("correctly counts degree for each node", () => {
    const degs = computeDegrees(["a", "b", "c"], [["a", "b"], ["b", "c"]]);
    expect(degs.get("a")).toBe(1);
    expect(degs.get("b")).toBe(2);
    expect(degs.get("c")).toBe(1);
  });

  it("returns 0 degree for orphan nodes", () => {
    const degs = computeDegrees(["a", "b", "orphan"], [["a", "b"]]);
    expect(degs.get("orphan")).toBe(0);
  });

  it("handles empty edges", () => {
    const degs = computeDegrees(["x", "y"], []);
    expect(degs.get("x")).toBe(0);
    expect(degs.get("y")).toBe(0);
  });

  it("handles empty node list", () => {
    const degs = computeDegrees([], CHAIN);
    expect(degs.size).toBe(0);
  });
});
