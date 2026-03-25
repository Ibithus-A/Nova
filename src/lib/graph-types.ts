/* ─────────────────────────── Shared Graph Types ─────────────────────────── */

export type SidebarItem = {
  id: string;
  label: string;
  type: "folder" | "page";
  children?: SidebarItem[];
};

export type PageData = {
  title: string;
  icon: string;
  body: string;
  tags: string[];
  /** Unix timestamp ms — used for time-lapse ordering */
  createdAt: number;
};

export type GraphEdge = [string, string];

export type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type Transform = {
  x: number;
  y: number;
  scale: number;
};
