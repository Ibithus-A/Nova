"use client";

import { useEffect, useRef, useState } from "react";

import { AuthCtaLink } from "@/components/auth-cta-link";
import { MarketingGraph } from "@/components/marketing-graph";
import { Reveal } from "@/components/reveal";

type PreviewMode = "deals" | "pages" | "graph";
type DealStatus = "Completed" | "Pending";

const previewDeals = [
  {
    id: "vista-jaggaer",
    status: "Completed" as DealStatus,
    badge: "ECM",
    title: "Vista Equity / Jaggaer",
    meta: "$1.1bn · Enterprise Software",
    lineClass: "is-green",
    noteTitle: "Vista / Jaggaer - Investment recap",
    noteCopy: "Take-private completed. Thesis, integration notes, and market positioning stay attached to the deal page.",
  },
  {
    id: "kkr-netco",
    status: "Pending" as DealStatus,
    badge: "LBO",
    title: "KKR / Telecom Italia NetCo",
    meta: "EUR22bn · Infrastructure",
    lineClass: "is-amber",
    noteTitle: "KKR / Telecom Italia NetCo - DD",
    noteCopy: "Regulation, financing, valuation work, and diligence notes stay attached to the live deal.",
  },
];

const previewPages = [
  {
    id: "semis",
    tag: "Sector",
    title: "European Semiconductors",
    meta: "6 linked deals · 3 assigned PDFs",
    noteTitle: "European Semiconductors",
    noteCopy: "A live page that collects catalysts, supply chain notes, and connected companies in one place.",
  },
  {
    id: "payments",
    tag: "Theme",
    title: "Payments Consolidation",
    meta: "4 linked deals · Arthur summary ready",
    noteTitle: "Payments Consolidation",
    noteCopy: "A thesis page where notes, PDFs, and deal updates stay synced instead of living in separate files.",
  },
];

const previewGraphNodes = [
  { id: "deal", label: "Deal", tone: "green", description: "Live transaction card linked to notes and people." },
  { id: "page", label: "Page", tone: "blue", description: "Structured thesis page with your research and assigned PDFs." },
  { id: "arthur", label: "Arthur", tone: "black", description: "Ask questions against only your workspace context." },
];
const previewModes: PreviewMode[] = ["deals", "pages", "graph"];

const landingDeals = [
  {
    id: "madison-air",
    amount: "$2.1bn",
    status: "In progress",
    conviction: "90%",
    title: "Madison Air Solutions",
    subtitle: "Class A common shares",
    chips: ["GS", "WT", "Airflow"],
  },
  {
    id: "goldman-innovator",
    amount: "$2.0bn",
    status: "Completed",
    conviction: "8.6",
    title: "Goldman Sachs",
    subtitle: "Innovator Capital Management",
    chips: ["GS", "Wealth", "Funds"],
  },
  {
    id: "neurocrine",
    amount: "$2.9bn",
    status: "In progress",
    conviction: "86%",
    title: "Neurocrine Biosciences",
    subtitle: "Soleno Therapeutics",
    chips: ["BIO", "NASDAQ", "Health"],
  },
  {
    id: "institutional",
    amount: "$8.0m",
    status: "Completed",
    conviction: "7.5",
    title: "Institutional Investors",
    subtitle: "Ghanem",
    chips: ["PE", "MENA", "Growth"],
  },
  {
    id: "realty-income",
    amount: "$800.0m",
    status: "Completed",
    conviction: "8.3",
    title: "Realty Income",
    subtitle: "Senior note",
    chips: ["TD", "WF", "Debt"],
  },
];

const trackerRows = [
  {
    id: "odyssey",
    type: "Merger",
    date: "Apr 08, 2026",
    title: "American Ocean Minerals -> Odyssey Marine",
    status: "In progress",
    region: "North America",
    country: "United States",
    sector: "Materials & Chemicals",
    firms: ["Moelis & Company", "Citi", "Cantor Fitzgerald"],
    amount: "$1.0B",
    heat: "Hot",
  },
  {
    id: "evercore",
    type: "Acquisition",
    date: "Apr 06, 2026",
    title: "Vista Equity -> Finastra carve-out",
    status: "Live",
    region: "Europe",
    country: "United Kingdom",
    sector: "Enterprise Software",
    firms: ["Evercore", "Qatalyst", "Goldman Sachs"],
    amount: "$3.4B",
    heat: "Live",
  },
];

const trackerSidebarSections = [
  {
    title: "M&A",
    subtitle: "Filter by category",
    icon: "↗",
    items: ["Acquisition", "Merger", "IPO"],
  },
  {
    title: "Venture Capital",
    subtitle: "Stage filters",
    icon: "◎",
    items: ["Angel", "Seed", "Series A", "Series B", "Series C", "Series D"],
  },
];

export default function HomePage() {
  const [showLiveMap, setShowLiveMap] = useState(false);
  const [isLiveMapVisible, setIsLiveMapVisible] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("deals");
  const [hoverPreviewMode, setHoverPreviewMode] = useState<PreviewMode | null>(null);
  const shouldScrollToMapRef = useRef(false);
  const liveMapSectionRef = useRef<HTMLElement | null>(null);
  const previewPauseRef = useRef(false);

  const currentPreviewMode = hoverPreviewMode ?? previewMode;
  const activeDeal = previewDeals[1];
  const activePage = previewPages[0];
  const activeGraphNode = previewGraphNodes[1];

  useEffect(() => {
    const handler = () => { if (window.scrollY > 80) setShowLiveMap(true); };
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    if (!showLiveMap || !shouldScrollToMapRef.current) return;
    liveMapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    shouldScrollToMapRef.current = false;
  }, [showLiveMap]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (previewPauseRef.current) return;
      setPreviewMode((current) => previewModes[(previewModes.indexOf(current) + 1) % previewModes.length]);
    }, 2600);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="lp-root">

      {/* ── Hero ── */}
      <section className="lp-hero">
        <Reveal>
          <div className="lp-hero-inner">
            <div className="lp-hero-copy">
              <div className="lp-hero-eyebrow">Financial research workspace</div>
              <h1 className="lp-hero-title">
                Where serious investors<br />build their edge.
              </h1>
              <p className="lp-hero-sub">
                Nova gives you a structured workspace to track deals, connect market themes,
                and build a living knowledge base — with an AI research partner that reads your notes.
              </p>
              <div className="lp-hero-ctas">
                <AuthCtaLink className="btn btn-primary btn-lg">Start for free</AuthCtaLink>
                <button
                  className="btn btn-secondary btn-lg"
                  type="button"
                  onClick={() => {
                    if (showLiveMap) {
                      liveMapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      return;
                    }
                    shouldScrollToMapRef.current = true;
                    setShowLiveMap(true);
                  }}
                >
                  See the knowledge graph
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
              <div className="lp-hero-metrics" aria-label="Workspace highlights">
                <div className="lp-hero-metric">
                  <span className="lp-hero-metric-value">Deals</span>
                  <span className="lp-hero-metric-label">Track live, pending, and completed situations.</span>
                </div>
                <div className="lp-hero-metric">
                  <span className="lp-hero-metric-value">Pages</span>
                  <span className="lp-hero-metric-label">Turn every thesis into a connected research note.</span>
                </div>
                <div className="lp-hero-metric">
                  <span className="lp-hero-metric-value">Arthur</span>
                  <span className="lp-hero-metric-label">Ask questions against your own notes and assigned PDFs.</span>
                </div>
              </div>
            </div>

            <div
              className="lp-hero-shot"
              aria-label="Workspace preview"
              onMouseEnter={() => { previewPauseRef.current = true; }}
              onMouseLeave={() => {
                previewPauseRef.current = false;
                setHoverPreviewMode(null);
              }}
            >
              <div className="lp-hero-shot-window">
                <div className="lp-hero-shot-shell">
                  <div className="lp-hero-shot-sidebar">
                    <div className="lp-hero-shot-logo">N</div>
                    <div className="lp-hero-shot-nav">
                      <button
                        type="button"
                        className={`lp-hero-shot-nav-item${currentPreviewMode === "deals" ? " is-active" : ""}`}
                        onMouseEnter={() => setHoverPreviewMode("deals")}
                        onClick={() => setPreviewMode("deals")}
                      >
                        Deals
                      </button>
                      <button
                        type="button"
                        className={`lp-hero-shot-nav-item${currentPreviewMode === "pages" ? " is-active" : ""}`}
                        onMouseEnter={() => setHoverPreviewMode("pages")}
                        onClick={() => setPreviewMode("pages")}
                      >
                        Pages
                      </button>
                      <button
                        type="button"
                        className={`lp-hero-shot-nav-item${currentPreviewMode === "graph" ? " is-active" : ""}`}
                        onMouseEnter={() => setHoverPreviewMode("graph")}
                        onClick={() => setPreviewMode("graph")}
                      >
                        Graph
                      </button>
                    </div>
                  </div>

                  <div className={`lp-hero-shot-main lp-hero-shot-main-${currentPreviewMode}`}>
                    <div className="lp-hero-shot-main-head">
                      <div>
                        <p className="lp-hero-shot-label">Workspace preview</p>
                        <h2 className="lp-hero-shot-title">
                          {currentPreviewMode === "deals" ? "Deal tracker" : currentPreviewMode === "pages" ? "Connected pages" : "Knowledge graph"}
                        </h2>
                      </div>
                      <div className="lp-hero-shot-pill">
                        {currentPreviewMode === "graph" ? "Limited preview" : "12 active"}
                      </div>
                    </div>

                    {currentPreviewMode === "deals" ? (
                      <>
                        <div className="lp-hero-shot-strip">
                          <span className="lp-hero-shot-strip-item">M&amp;A</span>
                          <span className="lp-hero-shot-strip-item">LBO</span>
                          <span className="lp-hero-shot-strip-item">IPO</span>
                        </div>

                        <div className="lp-hero-shot-cards">
                          {previewDeals.map((deal) => (
                            <div
                              key={deal.id}
                              className={`lp-hero-shot-card lp-hero-shot-card-button${activeDeal.id === deal.id ? " is-selected" : ""}`}
                            >
                              <div className={`lp-hero-shot-card-line ${deal.lineClass}`} />
                              <div className="lp-hero-shot-card-head">
                                <p className="lp-hero-shot-card-status">{deal.status}</p>
                                <span className="lp-hero-shot-card-badge">{deal.badge}</span>
                              </div>
                              <h3 className="lp-hero-shot-card-title">{deal.title}</h3>
                              <p className="lp-hero-shot-card-meta">{deal.meta}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {currentPreviewMode === "pages" ? (
                      <>
                        <div className="lp-hero-shot-strip">
                          <span className="lp-hero-shot-strip-item">Tagged notes</span>
                          <span className="lp-hero-shot-strip-item">Assigned PDFs</span>
                          <span className="lp-hero-shot-strip-item">Arthur ready</span>
                        </div>

                        <div className="lp-hero-shot-cards">
                          {previewPages.map((page) => (
                            <div
                              key={page.id}
                              className={`lp-hero-shot-card lp-hero-shot-card-button${activePage.id === page.id ? " is-selected" : ""}`}
                            >
                              <div className="lp-hero-shot-card-line is-blue" />
                              <div className="lp-hero-shot-card-head">
                                <p className="lp-hero-shot-card-status">Page</p>
                                <span className="lp-hero-shot-card-badge">{page.tag}</span>
                              </div>
                              <h3 className="lp-hero-shot-card-title">{page.title}</h3>
                              <p className="lp-hero-shot-card-meta">{page.meta}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}

                    {currentPreviewMode === "graph" ? (
                      <div className="lp-hero-shot-graph">
                        <div className="lp-hero-shot-graph-canvas" aria-label="Mini graph preview">
                          <svg
                            aria-hidden="true"
                            className="lp-hero-shot-graph-lines"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                          >
                            <line x1="22" y1="24" x2="72" y2="38" />
                            <line x1="22" y1="24" x2="49" y2="73" />
                            <line x1="72" y1="38" x2="49" y2="73" />
                          </svg>
                          {previewGraphNodes.map((node) => (
                            <div
                              key={node.id}
                              className={`lp-hero-shot-graph-node is-${node.tone}${activeGraphNode.id === node.id ? " is-selected" : ""}`}
                            >
                              <span className="lp-hero-shot-graph-dot" aria-hidden="true" />
                              <span className="lp-hero-shot-graph-node-label">{node.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="lp-hero-shot-note">
                      <div className="lp-hero-shot-note-head">
                        <div>
                          <span className="lp-hero-shot-note-kicker">
                            {currentPreviewMode === "deals" ? "Linked page" : currentPreviewMode === "pages" ? "Page preview" : "Graph summary"}
                          </span>
                          <p className="lp-hero-shot-note-title">
                            {currentPreviewMode === "deals"
                              ? activeDeal.noteTitle
                              : currentPreviewMode === "pages"
                                ? activePage.noteTitle
                                : activeGraphNode.label}
                          </p>
                        </div>
                        <span className="lp-hero-shot-note-tag">
                          {currentPreviewMode === "graph" ? "Read-only" : "Arthur ready"}
                        </span>
                      </div>
                      <p className="lp-hero-shot-note-copy">
                        {currentPreviewMode === "deals"
                          ? activeDeal.noteCopy
                          : currentPreviewMode === "pages"
                            ? activePage.noteCopy
                            : activeGraphNode.description}
                      </p>
                      <div className="lp-hero-shot-note-lines" aria-hidden="true">
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Ticker strip ── */}
      <div className="lp-ticker">
        <span className="lp-ticker-item">Mergers &amp; Acquisitions</span>
        <span className="lp-ticker-dot" aria-hidden="true">·</span>
        <span className="lp-ticker-item">Leveraged Buyouts</span>
        <span className="lp-ticker-dot" aria-hidden="true">·</span>
        <span className="lp-ticker-item">IPOs</span>
        <span className="lp-ticker-dot" aria-hidden="true">·</span>
        <span className="lp-ticker-item">Private Equity</span>
        <span className="lp-ticker-dot" aria-hidden="true">·</span>
        <span className="lp-ticker-item">Capital Markets</span>
        <span className="lp-ticker-dot" aria-hidden="true">·</span>
        <span className="lp-ticker-item">Venture Capital</span>
      </div>

      {/* ── Knowledge graph preview ── */}
      {showLiveMap && (
        <Reveal delay={40} onVisible={() => setIsLiveMapVisible(true)}>
          <section className="lp-graph-section" id="live-map" ref={liveMapSectionRef}>
            <div className="lp-section-wrap">
              <div className="lp-section-header">
                <p className="lp-eyebrow-label">Interactive knowledge graph</p>
                <h2 className="lp-section-title">Your research, mapped.</h2>
                <p className="lp-section-sub">
                  Every note becomes a node. Every link a connection. Navigate your entire
                  market thesis at a glance — zoom, filter, jump to any page.
                </p>
              </div>
              <div className="lp-graph-frame">
                {isLiveMapVisible ? <MarketingGraph /> : null}
              </div>
            </div>
          </section>
        </Reveal>
      )}

      {/* ── Features ── */}
      <section className="lp-deals-section" id="product-overview">
        <div className="lp-section-wrap">
          <Reveal delay={70}>
            <div className="lp-section-header lp-section-header-left">
              <p className="lp-eyebrow-label">Deal intelligence</p>
              <h2 className="lp-section-title">Track the week. Work the pipeline.</h2>
              <p className="lp-section-sub">
                A live rail for the market on top, then a structured deal tracker underneath so you can sort, filter,
                and move from headline flow into actual research.
              </p>
            </div>
          </Reveal>

          <Reveal delay={90}>
            <div className="lp-top-deals">
              <div className="lp-top-deals-head">
                <div>
                  <p className="lp-top-deals-kicker">Top deals this week</p>
                  <h3 className="lp-top-deals-title">Always moving. Always readable.</h3>
                </div>
                <span className="lp-top-deals-live">Live</span>
              </div>

              <div className="lp-top-deals-viewport">
                <div className="lp-top-deals-track">
                  {[...landingDeals, ...landingDeals].map((deal, index) => (
                    <article className="lp-top-deal-card" key={`${deal.id}-${index}`}>
                      <div className="lp-top-deal-top">
                        <span className="lp-top-deal-amount">{deal.amount}</span>
                        <span className="lp-top-deal-score">{deal.conviction}</span>
                      </div>
                      <p className="lp-top-deal-status">{deal.status}</p>
                      <div className="lp-top-deal-chips" aria-hidden="true">
                        {deal.chips.map((chip) => (
                          <span key={`${deal.id}-${index}-${chip}`} className="lp-top-deal-chip">{chip}</span>
                        ))}
                      </div>
                      <h4 className="lp-top-deal-name">{deal.title}</h4>
                      <p className="lp-top-deal-sub">{deal.subtitle}</p>
                      <span className="lp-top-deal-cta">See full breakdown</span>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={110}>
            <div className="lp-tracker-shell">
              <div className="lp-tracker-header">
                <div className="lp-tracker-header-copy">
                  <p className="lp-tracker-kicker">Deal tracker</p>
                  <h3 className="lp-tracker-title">A cleaner view of live market flow.</h3>
                  <p className="lp-tracker-sub">
                    Filter by type, sort by value, and move from the tape into structured research without breaking context.
                  </p>
                </div>
                <div className="lp-tracker-metrics">
                  <div className="lp-tracker-metric-card">
                    <span className="lp-tracker-metric-label">Global markets</span>
                    <strong>50+</strong>
                  </div>
                  <div className="lp-tracker-metric-card is-accent">
                    <span className="lp-tracker-metric-label">Deal volume</span>
                    <strong>$2.1T+</strong>
                  </div>
                  <div className="lp-tracker-metric-card">
                    <span className="lp-tracker-metric-label">Advisors</span>
                    <strong>100+</strong>
                  </div>
                </div>
              </div>

              <div className="lp-tracker-board">
                <aside className="lp-tracker-sidebar">
                  {trackerSidebarSections.map((section) => (
                    <div className="lp-tracker-sidebar-card" key={section.title}>
                      <div className="lp-tracker-sidebar-head">
                        <span className="lp-tracker-sidebar-icon">{section.icon}</span>
                        <div>
                          <h4>{section.title}</h4>
                          <p>{section.subtitle}</p>
                        </div>
                      </div>
                      <div className={section.items.length > 3 ? "lp-tracker-filter-grid" : "lp-tracker-filter-list"}>
                        {section.items.map((item, index) => (
                          <span className="lp-tracker-filter-item" key={item}>
                            <span className={`lp-tracker-check${index < 2 && section.title === "M&A" ? " is-checked" : ""}`} aria-hidden="true" />
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </aside>

                <div className="lp-tracker-main">
                  <div className="lp-tracker-toolbar">
                    <div className="lp-tracker-search">Sign in to search deals</div>
                    <div className="lp-tracker-toolbar-row">
                      <div className="lp-tracker-pill-row">
                        <span className="lp-tracker-pill is-active">Date</span>
                        <span className="lp-tracker-pill">Deal value</span>
                        <span className="lp-tracker-pill">Date filter</span>
                      </div>
                      <div className="lp-tracker-cta">Unlock full access</div>
                    </div>
                    <div className="lp-tracker-pill-row">
                      <span className="lp-tracker-filter-pill">Region</span>
                      <span className="lp-tracker-filter-pill">Country</span>
                      <span className="lp-tracker-filter-pill">Sector</span>
                      <span className="lp-tracker-filter-pill">Firms involved</span>
                      <span className="lp-tracker-filter-pill">All statuses</span>
                    </div>
                    <div className="lp-tracker-tabs">
                      <span className="lp-tracker-tab is-active">All</span>
                      <span className="lp-tracker-tab">Mergers</span>
                      <span className="lp-tracker-tab">Acquisitions</span>
                      <span className="lp-tracker-tab">ECM</span>
                      <span className="lp-tracker-tab">DCM</span>
                      <span className="lp-tracker-tab">Loans</span>
                    </div>
                  </div>

                  <div className="lp-tracker-list">
                    {trackerRows.map((row) => (
                      <article className="lp-tracker-row" key={row.id}>
                        <div className="lp-tracker-row-main">
                          <div className="lp-tracker-row-top">
                            <span className="lp-tracker-row-type">{row.type}</span>
                            <span className="lp-tracker-row-date">{row.date}</span>
                          </div>
                          <h4 className="lp-tracker-row-title">{row.title}</h4>
                          <div className="lp-tracker-row-tags">
                            <span>{row.status}</span>
                            <span>{row.sector}</span>
                            <span>{row.region}</span>
                            <span>{row.country}</span>
                          </div>
                          <div className="lp-tracker-row-firms">
                            {row.firms.map((firm) => (
                              <span key={`${row.id}-${firm}`}>{firm}</span>
                            ))}
                          </div>
                        </div>
                        <div className="lp-tracker-row-side">
                          <span className="lp-tracker-row-badge">{row.heat}</span>
                          <strong>{row.amount}</strong>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="lp-features-section" id="features">
        <div className="lp-section-wrap">
          <Reveal delay={60}>
            <div className="lp-section-header">
              <p className="lp-eyebrow-label">The workspace</p>
              <h2 className="lp-section-title">Everything you need.<br />Nothing you don&apos;t.</h2>
            </div>
          </Reveal>

          <div className="lp-features-grid">
            <Reveal delay={80}>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">🔗</div>
                <div className="lp-feature-text">
                  <h3 className="lp-feature-title">Knowledge graph</h3>
                  <p className="lp-feature-body">
                    See how deals, companies, and themes connect. Navigate your entire research
                    map interactively — zoom, filter by tag, and jump to any page with one click.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">🤖</div>
                <div className="lp-feature-text">
                  <h3 className="lp-feature-title">Arthur AI</h3>
                  <p className="lp-feature-body">
                    Your AI research partner. Ask questions, get summaries, or let it write
                    and update pages — it reads your notes, not generic data.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📊</div>
                <div className="lp-feature-text">
                  <h3 className="lp-feature-title">Deal tracker</h3>
                  <p className="lp-feature-body">
                    Track mergers, buyouts, IPOs, and fundraisings with structured fields.
                    Filter and sort as your pipeline grows.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📄</div>
                <div className="lp-feature-text">
                  <h3 className="lp-feature-title">PDF research library</h3>
                  <p className="lp-feature-body">
                    Upload prospectuses, filings, and reports. Assign them to pages and
                    let Arthur reason across documents alongside your notes.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📰</div>
                <div className="lp-feature-text">
                  <h3 className="lp-feature-title">Curated intelligence</h3>
                  <p className="lp-feature-body">
                    Published pages covering major deals and sector narratives. Save and
                    annotate anything into your personal workspace to build on.
                  </p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={140}>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">✏️</div>
                <div className="lp-feature-text">
                  <h3 className="lp-feature-title">Personal workspace</h3>
                  <p className="lp-feature-body">
                    Your private layer for notes and analysis. Separate from published
                    content but feeds the same knowledge graph.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-pricing-section" id="pricing">
        <div className="lp-section-wrap">
          <Reveal delay={60}>
            <div className="lp-section-header">
              <p className="lp-eyebrow-label">Pricing</p>
              <h2 className="lp-section-title">Start reading.<br />Scale into research.</h2>
              <p className="lp-section-sub">Every plan includes curated market content. Upgrade when you&apos;re ready to go deeper.</p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="lp-plans">
              <div className="lp-plan">
                <div className="lp-plan-header">
                  <span className="lp-plan-name">Basic</span>
                  <div className="lp-plan-price">$9<span className="lp-plan-mo">/mo</span></div>
                  <p className="lp-plan-pitch">For readers who want structured market context without the noise.</p>
                </div>
                <ul className="lp-plan-list">
                  <li>Curated deal intelligence pages</li>
                  <li>Deal tracker</li>
                  <li>Knowledge graph</li>
                  <li>Personal notes workspace</li>
                </ul>
                <AuthCtaLink className="btn btn-secondary btn-lg lp-plan-btn">Get started</AuthCtaLink>
              </div>

              <div className="lp-plan lp-plan-featured">
                <div className="lp-plan-badge">Most popular</div>
                <div className="lp-plan-header">
                  <span className="lp-plan-name">Plus</span>
                  <div className="lp-plan-price">$19<span className="lp-plan-mo">/mo</span></div>
                  <p className="lp-plan-pitch">For analysts who want AI to work alongside their research.</p>
                </div>
                <ul className="lp-plan-list">
                  <li>Everything in Basic</li>
                  <li>Arthur AI assistant</li>
                  <li>PDF library with AI reasoning</li>
                  <li>AI-assisted page editing</li>
                </ul>
                <AuthCtaLink className="btn lp-plan-btn lp-plan-cta">Get started</AuthCtaLink>
              </div>

              <div className="lp-plan">
                <div className="lp-plan-header">
                  <span className="lp-plan-name">Premium</span>
                  <div className="lp-plan-price">$49<span className="lp-plan-mo">/mo</span></div>
                  <p className="lp-plan-pitch">For power users who want priority access and direct support.</p>
                </div>
                <ul className="lp-plan-list">
                  <li>Everything in Plus</li>
                  <li>Priority content updates</li>
                  <li>Early feature access</li>
                  <li>Direct support</li>
                </ul>
                <AuthCtaLink className="btn btn-secondary btn-lg lp-plan-btn">Get started</AuthCtaLink>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

    </main>
  );
}
