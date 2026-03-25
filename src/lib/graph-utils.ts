import type { GraphEdge, SidebarItem, PageData } from "./graph-types";
import type { GraphGroup } from "./graph-store";

/* ─── Traversal ─── */

/**
 * BFS from centerId up to `depth` hops. Returns all reachable node IDs
 * (including the center). Handles cycles and disconnected nodes safely.
 */
export function getLocalGraphNodeIds(
  centerId: string,
  edges: GraphEdge[],
  depth: number,
): Set<string> {
  const visited = new Set<string>([centerId]);
  let frontier = [centerId];

  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const [a, b] of edges) {
        const neighbor = a === id ? b : b === id ? a : null;
        if (neighbor && !visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  return visited;
}

/**
 * Returns node IDs that appear in no edge in the given edge list.
 */
export function getOrphanIds(
  allPageIds: string[],
  edges: GraphEdge[],
): Set<string> {
  const connected = new Set<string>();
  for (const [a, b] of edges) {
    connected.add(a);
    connected.add(b);
  }
  return new Set(allPageIds.filter((id) => !connected.has(id)));
}

/**
 * Find the first matching group for a given page (first-match-wins precedence).
 * Matches by exact tag name (case-insensitive) or title substring.
 */
export function matchGroup(
  _pageId: string,
  pageData: PageData | undefined,
  groups: GraphGroup[],
): GraphGroup | null {
  if (!pageData) return null;
  for (const group of groups) {
    const q = group.query.trim().toLowerCase();
    if (!q) continue;
    if (pageData.tags.some((t) => t.toLowerCase() === q)) return group;
    if (pageData.title.toLowerCase().includes(q)) return group;
  }
  return null;
}

/**
 * Flatten a nested SidebarItem tree to only pages.
 */
export function getAllPagesFlat(nodes: SidebarItem[]): SidebarItem[] {
  const out: SidebarItem[] = [];
  for (const n of nodes) {
    if (n.type === "page") out.push(n);
    else if (n.children) out.push(...getAllPagesFlat(n.children));
  }
  return out;
}

function addEdge(edgeSet: Set<string>, a: string, b: string) {
  if (!a || !b || a === b) return;
  const [left, right] = a < b ? [a, b] : [b, a];
  edgeSet.add(`${left}::${right}`);
}

function addSequentialEdges(edgeSet: Set<string>, pageIds: string[]) {
  for (let index = 1; index < pageIds.length; index++) {
    addEdge(edgeSet, pageIds[index - 1], pageIds[index]);
  }
}

function extractLinkedPageIds(body: string): string[] {
  const matches = body.matchAll(/data-page-id="([^"]+)"/g);
  return [...matches].map((match) => match[1]).filter(Boolean);
}

export function deriveGraphEdges(
  tree: SidebarItem[],
  pageData: Record<string, PageData>,
): GraphEdge[] {
  const edgeSet = new Set<string>();
  const allPages = getAllPagesFlat(tree);

  const tagBuckets = new Map<string, string[]>();
  for (const page of allPages) {
    const tags = pageData[page.id]?.tags ?? [];
    for (const tag of tags) {
      const normalizedTag = tag.trim().toLowerCase();
      if (!normalizedTag) continue;
      const bucket = tagBuckets.get(normalizedTag) ?? [];
      bucket.push(page.id);
      tagBuckets.set(normalizedTag, bucket);
    }
  }

  for (const pageIds of tagBuckets.values()) {
    // Keep shared-tag relationships legible by connecting the group lightly
    // instead of turning every tag bucket into a full clique.
    addSequentialEdges(edgeSet, [...new Set(pageIds)].sort());
  }

  for (const page of allPages) {
    const body = pageData[page.id]?.body ?? "";
    for (const linkedPageId of extractLinkedPageIds(body)) {
      if (pageData[linkedPageId]) {
        addEdge(edgeSet, page.id, linkedPageId);
      }
    }
  }

  return [...edgeSet].map((edge) => {
    const [a, b] = edge.split("::");
    return [a, b] as GraphEdge;
  });
}

/**
 * Get edges visible in the local graph (both endpoints must be in visibleSet).
 */
export function filterEdges(
  edges: GraphEdge[],
  visibleIds: Set<string>,
): GraphEdge[] {
  return edges.filter(([a, b]) => visibleIds.has(a) && visibleIds.has(b));
}

/**
 * Linear interpolation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Maps normalized 0–1 force sliders to physics constants.
 */
export const forceFromNorm = {
  repel: (t: number) => lerp(3000, 28000, t),
  link: (t: number) => lerp(0.01, 0.14, t),
  distance: (t: number) => lerp(80, 420, t),
  center: (t: number) => lerp(0.001, 0.022, t),
};

/**
 * Sort pages by createdAt ascending for time-lapse playback.
 */
export function sortPagesByDate(
  pages: SidebarItem[],
  pageData: Record<string, PageData>,
): SidebarItem[] {
  return [...pages].sort(
    (a, b) => (pageData[a.id]?.createdAt ?? 0) - (pageData[b.id]?.createdAt ?? 0),
  );
}

/**
 * Compute degree (edge count) for each node.
 */
export function computeDegrees(
  allPageIds: string[],
  edges: GraphEdge[],
): Map<string, number> {
  const deg = new Map<string, number>();
  for (const id of allPageIds) deg.set(id, 0);
  for (const [a, b] of edges) {
    if (deg.has(a)) deg.set(a, deg.get(a)! + 1);
    if (deg.has(b)) deg.set(b, deg.get(b)! + 1);
  }
  return deg;
}
