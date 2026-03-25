import { WorkspaceAuthGuard } from "@/components/workspace-auth-guard";

export default function WorkspacePage() {
  return <WorkspaceAuthGuard />;
}
