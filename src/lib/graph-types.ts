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
  iconColor?: string;
  body: string;
  tags: string[];
  /** Unix timestamp ms — used for time-lapse ordering */
  createdAt: number;
};

export type SharedPdf = {
  id: string;
  name: string;
  text: string;
  extractionMode?: "text" | "ocr" | "hybrid";
  pageCount?: number;
  assignedPageIds: string[];
  uploadedAt: number;
};

/* ─────────────────────────── Deal Tracker ───────────────────────────────── */

export type DealStatus = "rumored" | "announced" | "pending" | "completed" | "terminated";
export type DealType = "Mergers & Acquisitions" | "Leveraged Buyout" | "Initial Public Offering" | "Equity Capital Markets" | "Debt Capital Markets" | "Private Equity" | "Venture Capital" | "Fundraising" | "Exit" | "Other";

export type Deal = {
  id: string;
  name: string;
  type: DealType;
  amount?: string;
  status: DealStatus;
  acquirer?: string;
  target?: string;
  sector?: string;
  advisors?: string;
  date?: string;
  linkedPageId?: string;
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
