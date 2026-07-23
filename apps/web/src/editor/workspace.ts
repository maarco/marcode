import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useParams } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";

import { primaryServerConfigAtom } from "../state/server";
import { useProject, useProjects, useThread } from "../state/entities";
import { resolveThreadRouteTarget } from "../threadRoutes";

/**
 * Workspace root for the floating code editor: the active thread's repo
 * (worktree-aware), else the first known project, else the server cwd.
 */
export function useWorkspace(): { workspacePath: string | null } {
  const params = useParams({ strict: false });
  const routeTarget = resolveThreadRouteTarget(params);
  const threadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const thread = useThread(threadRef);
  const projectRef = thread ? scopeProjectRef(thread.environmentId, thread.projectId) : null;
  const project = useProject(projectRef);
  const projects = useProjects();
  const serverCwd = useAtomValue(primaryServerConfigAtom)?.cwd ?? null;

  const workspacePath = useMemo(() => {
    if (thread?.worktreePath) return thread.worktreePath;
    if (project) return project.workspaceRoot;
    const firstProject = projects[0];
    if (firstProject) return firstProject.workspaceRoot;
    return serverCwd;
  }, [thread?.worktreePath, project, projects, serverCwd]);

  return { workspacePath };
}
