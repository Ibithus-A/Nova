import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ─── Group definition ─── */
export type GraphGroup = {
  id: string;
  /** Display name */
  name: string;
  /** Hex color for node fill, e.g. "#e67e22" */
  color: string;
  /** Tag name OR title substring to match (case-insensitive) */
  query: string;
};

/* ─── Settings type (explicit, not inferred from const) ─── */
export type GraphSettings = {
  // Filters
  showOrphans: boolean;

  // Display
  /** Scale below which node labels fade out (0 = always show, 1 = always hide) */
  showArrows: boolean;
  textFadeThreshold: number;
  /** Node radius multiplier 0.5–2 */
  nodeSize: number;
  /** Edge stroke-width multiplier 0.5–3 */
  linkThickness: number;

  // Forces (all 0–1 normalized, mapped to physics values in sim)
  centerForce: number;
  repelForce: number;
  linkForce: number;
  /** Preferred edge rest length (normalized) */
  linkDistance: number;

  // Groups
  groups: GraphGroup[];
};

/* ─── Default values ─── */
export const GRAPH_DEFAULTS: GraphSettings = {
  showOrphans: true,
  showArrows: false,
  textFadeThreshold: 0.45,
  nodeSize: 1.0,
  linkThickness: 1.0,
  centerForce: 0.5,
  repelForce: 1,
  linkForce: 0,
  linkDistance: 0.5,
  groups: [],
};

type GraphStore = GraphSettings & {
  set: (patch: Partial<GraphSettings>) => void;
  addGroup: (g: GraphGroup) => void;
  updateGroup: (id: string, patch: Partial<Omit<GraphGroup, "id">>) => void;
  removeGroup: (id: string) => void;
  reset: () => void;
};

export const useGraphStore = create<GraphStore>()(
  persist(
    (set) => ({
      ...GRAPH_DEFAULTS,
      set: (patch) => set(patch as Partial<GraphStore>),
      addGroup: (g) => set((s) => ({ groups: [...s.groups, g] })),
      updateGroup: (id, patch) =>
        set((s) => ({
          groups: s.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      removeGroup: (id) =>
        set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })),
      reset: () => set({ ...GRAPH_DEFAULTS }),
    }),
    {
      name: "nova-graph-settings",
      version: 3,
      migrate: (persistedState) => {
        const state = persistedState as Partial<GraphStore> | undefined;

        return {
          ...GRAPH_DEFAULTS,
          ...state,
          repelForce: GRAPH_DEFAULTS.repelForce,
          linkForce: GRAPH_DEFAULTS.linkForce,
        };
      },
    },
  ),
);
