import { AdminWorkspace } from "@/components/admin-workspace";
import { PageShell } from "@/components/page-shell";

export default function WorkspacePage() {
  return (
    <PageShell width="wide">
      <div className="content-shell-wide section-stack">
        <div className="section-intro-tight">
          <p className="section-label">Admin home</p>
          <h1 className="section-title">Workspace</h1>
        </div>

        <AdminWorkspace />
      </div>
    </PageShell>
  );
}
