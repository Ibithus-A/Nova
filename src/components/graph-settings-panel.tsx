"use client";

import { useId, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useGraphStore, type GraphGroup } from "@/lib/graph-store";

/* ─── Helpers ─── */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ─── Sub-components ─── */

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button className="gsp-section-hdr" onClick={onToggle} type="button">
      <span className="gsp-section-label">{label}</span>
      {open ? (
        <ChevronDown size={13} strokeWidth={2} />
      ) : (
        <ChevronRight size={13} strokeWidth={2} />
      )}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="gsp-toggle-row">
      <span className="gsp-toggle-label">{label}</span>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        className={`gsp-toggle${checked ? " gsp-toggle-on" : ""}`}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span className="gsp-toggle-thumb" />
      </button>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  id,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  id: string;
}) {
  return (
    <div className="gsp-slider-row">
      <label htmlFor={id} className="gsp-slider-label">
        {label}
      </label>
      <div className="gsp-slider-track-wrap">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="gsp-slider"
          style={
            { "--pct": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties
          }
        />
        <span className="gsp-slider-val">{value.toFixed(step < 1 ? 1 : 0)}</span>
      </div>
    </div>
  );
}

/* ─── Groups editor ─── */

const GROUP_PRESETS = [
  "#e67e22",
  "#2980b9",
  "#27ae60",
  "#8e44ad",
  "#c0392b",
  "#16a085",
  "#d35400",
  "#2c3e50",
];

function GroupRow({
  group,
  onUpdate,
  onRemove,
}: {
  group: GraphGroup;
  onUpdate: (patch: Partial<Omit<GraphGroup, "id">>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="gsp-group-row">
      <input
        type="color"
        value={group.color}
        onChange={(e) => onUpdate({ color: e.target.value })}
        className="gsp-group-color"
        title="Group color"
        aria-label="Group color"
      />
      <input
        className="gsp-group-input"
        value={group.name}
        placeholder="Name"
        onChange={(e) => onUpdate({ name: e.target.value })}
        aria-label="Group name"
      />
      <input
        className="gsp-group-input"
        value={group.query}
        placeholder="Tag or keyword"
        onChange={(e) => onUpdate({ query: e.target.value })}
        aria-label="Group query"
        title="Matches by tag name or title substring"
      />
      <button
        className="gsp-group-remove"
        onClick={onRemove}
        type="button"
        title="Remove group"
        aria-label="Remove group"
      >
        <Trash2 size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ─── Main panel ─── */

export function GraphSettingsPanel({
  open,
  onClose,
  activeTag,
  availableTags,
  onActiveTagChange,
}: {
  open: boolean;
  onClose: () => void;
  activeTag: string | null;
  availableTags: string[];
  onActiveTagChange: (tag: string | null) => void;
}) {
  const store = useGraphStore();
  const baseId = useId();
  const [tagSearch, setTagSearch] = useState("");

  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    return q ? availableTags.filter((t) => t.toLowerCase().includes(q)) : availableTags;
  }, [availableTags, tagSearch]);

  const [sections, setSections] = useState({
    filters: true,
    groups: true,
    display: true,
    forces: false,
  });

  const toggleSection = (key: keyof typeof sections) =>
    setSections((s) => ({ ...s, [key]: !s[key] }));

  return (
    <>
      {/* Backdrop (click outside closes) */}
      {open && (
        <div
          className="gsp-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        className={`gsp-panel${open ? " gsp-panel-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Graph settings"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="gsp-header">
          <span className="gsp-title">Graph Settings</span>
          <div className="gsp-header-actions">
            <button
              className="ws-icon-btn"
              onClick={() => store.reset()}
              title="Reset to defaults"
              aria-label="Reset to defaults"
              type="button"
            >
              <RotateCcw size={13} strokeWidth={2} />
            </button>
            <button
              className="ws-icon-btn"
              onClick={onClose}
              title="Close settings"
              aria-label="Close settings"
              type="button"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="gsp-body">

          {/* ── Filters ── */}
          <SectionHeader
            label="Filters"
            open={sections.filters}
            onToggle={() => toggleSection("filters")}
          />
          {sections.filters && (
            <div className="gsp-section-body">
              <Toggle
                id={`${baseId}-orphans`}
                label="Show orphan nodes"
                checked={store.showOrphans}
                onChange={(v) => store.set({ showOrphans: v })}
              />
              <div className="gsp-filter-block">
                <div className="gsp-tag-filter-header">
                  <span className="gsp-slider-label">Tag filter</span>
                  {activeTag && (
                    <button
                      className="gsp-tag-clear"
                      onClick={() => { onActiveTagChange(null); setTagSearch(""); }}
                      type="button"
                      title="Clear filter"
                    >
                      <X size={10} strokeWidth={2.5} /> Clear
                    </button>
                  )}
                </div>
                {activeTag && (
                  <div className="gsp-active-tag-row">
                    <span className="gsp-active-tag">
                      {activeTag}
                      <button
                        className="gsp-active-tag-remove"
                        onClick={() => { onActiveTagChange(null); setTagSearch(""); }}
                        type="button"
                        aria-label="Remove filter"
                      >
                        <X size={9} strokeWidth={2.5} />
                      </button>
                    </span>
                  </div>
                )}
                <div className="gsp-tag-search-wrap">
                  <Search size={11} strokeWidth={2} className="gsp-tag-search-icon" aria-hidden="true" />
                  <input
                    className="gsp-tag-search"
                    placeholder="Search tags…"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    aria-label="Search tags"
                  />
                  {tagSearch && (
                    <button
                      className="gsp-tag-search-clear"
                      onClick={() => setTagSearch("")}
                      type="button"
                      aria-label="Clear search"
                    >
                      <X size={10} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                {tagSearch.trim() ? (
                  filteredTags.length > 0 ? (
                    <div className="gsp-tag-chips">
                      {filteredTags.map((tag) => (
                        <button
                          key={tag}
                          className={`gsp-tag-chip${activeTag === tag ? " gsp-tag-chip-active" : ""}`}
                          onClick={() => onActiveTagChange(activeTag === tag ? null : tag)}
                          type="button"
                          title={`Filter by "${tag}"`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="gsp-hint" style={{ marginTop: "0.35rem" }}>No tags match.</p>
                  )
                ) : (
                  !activeTag && (
                    <p className="gsp-hint" style={{ marginTop: "0.35rem" }}>Type to search tags.</p>
                  )
                )}
              </div>
            </div>
          )}

          {/* ── Groups ── */}
          <SectionHeader
            label="Groups"
            open={sections.groups}
            onToggle={() => toggleSection("groups")}
          />
          {sections.groups && (
            <div className="gsp-section-body">
              <p className="gsp-hint">
                Tag or keyword → color. First match wins.
              </p>
              {store.groups.length > 0 && (
                <div className="gsp-groups-list">
                  <div className="gsp-group-header-row">
                    <span className="gsp-group-col-label" style={{ marginLeft: "1.5rem" }}>Name</span>
                    <span className="gsp-group-col-label">Query</span>
                  </div>
                  {store.groups.map((g) => (
                    <GroupRow
                      key={g.id}
                      group={g}
                      onUpdate={(patch) => store.updateGroup(g.id, patch)}
                      onRemove={() => store.removeGroup(g.id)}
                    />
                  ))}
                </div>
              )}
              <div className="gsp-group-presets">
                {GROUP_PRESETS.map((color) => (
                  <button
                    key={color}
                    className="gsp-preset-dot"
                    style={{ background: color }}
                    onClick={() =>
                      store.addGroup({
                        id: uid(),
                        name: "New group",
                        color,
                        query: "",
                      })
                    }
                    title={`Add group (${color})`}
                    type="button"
                    aria-label={`Add group with color ${color}`}
                  />
                ))}
                <button
                  className="gsp-add-group-btn"
                  onClick={() =>
                    store.addGroup({
                      id: uid(),
                      name: "New group",
                      color: "#636366",
                      query: "",
                    })
                  }
                  type="button"
                >
                  <Plus size={11} strokeWidth={2.2} />
                  Add group
                </button>
              </div>
            </div>
          )}

          {/* ── Display ── */}
          <SectionHeader
            label="Display"
            open={sections.display}
            onToggle={() => toggleSection("display")}
          />
          {sections.display && (
            <div className="gsp-section-body">
              <Toggle
                id={`${baseId}-arrows`}
                label="Show direction arrows"
                checked={store.showArrows}
                onChange={(v) => store.set({ showArrows: v })}
              />
              <Slider
                id={`${baseId}-nodesz`}
                label="Node size"
                value={store.nodeSize}
                min={0.4}
                max={2.2}
                step={0.1}
                onChange={(v) => store.set({ nodeSize: v })}
              />
              <Slider
                id={`${baseId}-linkthk`}
                label="Link thickness"
                value={store.linkThickness}
                min={0.3}
                max={3.0}
                step={0.1}
                onChange={(v) => store.set({ linkThickness: v })}
              />
              <Slider
                id={`${baseId}-fade`}
                label="Label fade threshold"
                value={store.textFadeThreshold}
                min={0.1}
                max={1.0}
                step={0.05}
                onChange={(v) => store.set({ textFadeThreshold: v })}
              />
            </div>
          )}

          {/* ── Forces ── */}
          <SectionHeader
            label="Forces"
            open={sections.forces}
            onToggle={() => toggleSection("forces")}
          />
          {sections.forces && (
            <div className="gsp-section-body">
              <Slider
                id={`${baseId}-repel`}
                label="Repel force"
                value={store.repelForce}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => store.set({ repelForce: v })}
              />
              <Slider
                id={`${baseId}-link`}
                label="Link force"
                value={store.linkForce}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => store.set({ linkForce: v })}
              />
              <Slider
                id={`${baseId}-dist`}
                label="Link distance"
                value={store.linkDistance}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => store.set({ linkDistance: v })}
              />
              <Slider
                id={`${baseId}-center`}
                label="Center force"
                value={store.centerForce}
                min={0}
                max={1}
                step={0.05}
                onChange={(v) => store.set({ centerForce: v })}
              />
            </div>
          )}

          {/* ── Reset ── */}
          <div className="gsp-reset-row">
            <button
              className="btn btn-ghost btn-sm gsp-reset-btn"
              onClick={() => store.reset()}
              type="button"
            >
              <RotateCcw size={12} strokeWidth={2} />
              Reset all to defaults
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
