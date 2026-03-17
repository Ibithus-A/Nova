import type { ReactNode } from "react";

type PageShellProps = {
  children: ReactNode;
  width?: "default" | "narrow" | "wide";
};

const widthClassName = {
  default: "content-shell",
  narrow: "content-shell-narrow",
  wide: "content-shell-wide",
};

export function PageShell({ children, width = "default" }: PageShellProps) {
  return (
    <main id="main-content" className="min-h-screen">
      <section className="page-section">
        <div className={`page-shell ${widthClassName[width]}`}>{children}</div>
      </section>
    </main>
  );
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="stack-24">
      {eyebrow ? <p className="section-label">{eyebrow}</p> : null}
      <div className="stack-16">
        <h1 className="display-title">{title}</h1>
        {description ? <p className="body-lead max-w-3xl">{description}</p> : null}
      </div>
      {actions ? <div className="cluster-actions">{actions}</div> : null}
    </header>
  );
}

type PanelProps = {
  children: ReactNode;
  tone?: "default" | "dark" | "subtle";
  padded?: "md" | "lg";
  className?: string;
};

const toneClassName = {
  default: "panel",
  dark: "panel panel-dark",
  subtle: "panel panel-subtle",
};

const paddedClassName = {
  md: "panel-pad-md",
  lg: "panel-pad-lg",
};

export function Panel({ children, tone = "default", padded = "md", className = "" }: PanelProps) {
  const classes = [toneClassName[tone], paddedClassName[padded], className].filter(Boolean).join(" ");

  return <div className={classes}>{children}</div>;
}
