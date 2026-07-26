import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";

import { primaryServerConfigAtom } from "../state/server";
import { useComposerDraftStore } from "../composerDraftStore";
import { usePrimaryEnvironmentId } from "../state/environments";
import { useProject, useProjects, useThread } from "../state/entities";
import { resolveThreadRouteTarget } from "../threadRoutes";

export interface Workspace {
  /**
   * Workspace root for the floating code editor: the active thread's repo
   * (worktree-aware), else the first known project, else the server cwd.
   * Doubles as the `cwd` for environment file RPCs (worktree-aware).
   */
  readonly workspacePath: string | null;
  /**
   * Environment the floating editor targets: the active thread's environment,
   * else the primary environment. Drives all env-scoped file state.
   */
  readonly environmentId: EnvironmentId | null;
}

export function useWorkspace(): Workspace {
  const params = useParams({ strict: false });
  const routeTarget = resolveThreadRouteTarget(params);
  const threadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const thread = useThread(threadRef);
  // A draft is not a server thread yet, but it already carries the project,
  // environment and worktree it will be created in — so it resolves the
  // workspace exactly like a real thread does. Without this, every draft route
  // fell through to `projects[0]`, pointing the editor (and the git panel's
  // commit / push / stash / branch actions) at an unrelated repo.
  const draftSession = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );
  const target = thread ?? draftSession;
  const projectRef = target ? scopeProjectRef(target.environmentId, target.projectId) : null;
  const project = useProject(projectRef);
  const projects = useProjects();
  const serverCwd = useAtomValue(primaryServerConfigAtom)?.cwd ?? null;
  const primaryEnvironmentId = usePrimaryEnvironmentId();

  const workspacePath = useMemo(() => {
    if (target?.worktreePath) return target.worktreePath;
    if (project) return project.workspaceRoot;
    const firstProject = projects[0];
    if (firstProject) return firstProject.workspaceRoot;
    return serverCwd;
  }, [target?.worktreePath, project, projects, serverCwd]);

  const environmentId = useMemo(
    () => target?.environmentId ?? primaryEnvironmentId ?? null,
    [target?.environmentId, primaryEnvironmentId],
  );

  return { workspacePath, environmentId };
}
