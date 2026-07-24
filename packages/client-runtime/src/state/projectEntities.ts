import type {
  EnvironmentId,
  OrchestrationProjectShell,
  OrchestrationShellSnapshot,
  ProjectId,
  ScopedProjectRef,
} from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentProject } from "./models.ts";
import { scopeProject } from "./models.ts";
import type { EnvironmentCatalogState } from "./connections.ts";
import { arrayElementsEqual, parseProjectKey, projectKey, projectRefsEqual } from "./entities.ts";

const EMPTY_PROJECTS: ReadonlyArray<OrchestrationProjectShell> = Object.freeze([]);
const EMPTY_PROJECT_INDEX: ReadonlyMap<ProjectId, OrchestrationProjectShell> = new Map();

export type EnvironmentProjectAtomAccessor = (
  ref: ScopedProjectRef,
) => Atom.Atom<EnvironmentProject | null>;

/**
 * The `projectAtom` accessor from the most recent `createEnvironmentProjectAtoms`
 * call below — i.e. whichever running app (today, `apps/web`; `apps/mobile` does not
 * use the unified workspace tree) most recently wired this factory up to its own
 * live connection/catalog atoms.
 *
 * `packages/client-runtime` has no ambient DI container and no app-agnostic way to
 * build a live `EnvironmentRegistry` on its own — transport, persistence, and
 * platform Layers are all supplied per app (see `connection/layer.ts` plus each
 * app's own `connection/runtime.ts`). `state/projectWorkspace.ts`'s
 * `useProjectWorkspaceLayout` is frozen (see the unified-workspace-tree interface
 * freeze) as a bare `(environmentId, projectId)` hook with no wiring parameter, so
 * it has no other way to reach the app's already-connected project shell without
 * standing up a second, disconnected connection or a duplicate subscription.
 * Reading through this registration instead reuses the exact same live
 * `EnvironmentProject` atom `useProject`/`useThreadShellsForProjectRefs` already
 * read — no new store, no second fetch.
 *
 * This is intentionally narrow — a general cross-package DI mechanism is neither
 * needed nor provided beyond this one case. Safe for the one real caller: every app
 * that renders the unified workspace tree calls `createEnvironmentProjectAtoms`
 * exactly once, at module scope, as part of its normal (already-existing) project
 * wiring — well before any component renders and reads `useProjectWorkspaceLayout`.
 * Tests that exercise `projectWorkspace.ts` in isolation must call
 * `createEnvironmentProjectAtoms` first (see `projectWorkspace.test.ts`).
 */
let latestEnvironmentProjectAtomAccessor: EnvironmentProjectAtomAccessor | null = null;

export function getLatestEnvironmentProjectAtomAccessor(): EnvironmentProjectAtomAccessor | null {
  return latestEnvironmentProjectAtomAccessor;
}

export function createEnvironmentProjectAtoms(input: {
  readonly catalogValueAtom: Atom.Atom<EnvironmentCatalogState>;
  readonly snapshotAtom: (
    environmentId: EnvironmentId,
  ) => Atom.Atom<OrchestrationShellSnapshot | null>;
}) {
  const environmentProjectsAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make(
      (get): ReadonlyArray<OrchestrationProjectShell> =>
        get(input.snapshotAtom(environmentId))?.projects ?? EMPTY_PROJECTS,
    ).pipe(Atom.withLabel(`environment-projects:${environmentId}`)),
  );

  const environmentProjectIndexAtom = Atom.family((environmentId: EnvironmentId) =>
    Atom.make((get): ReadonlyMap<ProjectId, OrchestrationProjectShell> => {
      const projects = get(environmentProjectsAtom(environmentId));
      if (projects.length === 0) {
        return EMPTY_PROJECT_INDEX;
      }
      return new Map(projects.map((project) => [project.id, project] as const));
    }).pipe(Atom.withLabel(`environment-project-index:${environmentId}`)),
  );

  const environmentProjectRefsAtom = Atom.family((environmentId: EnvironmentId) => {
    let previous: ReadonlyArray<ScopedProjectRef> = [];
    return Atom.make((get) => {
      const next = get(environmentProjectsAtom(environmentId)).map((project) => ({
        environmentId,
        projectId: project.id,
      }));
      if (projectRefsEqual(previous, next)) {
        return previous;
      }
      previous = next;
      return next;
    }).pipe(Atom.withLabel(`environment-project-refs:${environmentId}`));
  });

  const projectAtomFamily = Atom.family((key: string) => {
    const ref = parseProjectKey(key);
    let previousSource: OrchestrationProjectShell | null = null;
    let previousValue: EnvironmentProject | null = null;
    return Atom.make((get) => {
      const source = get(environmentProjectIndexAtom(ref.environmentId)).get(ref.projectId) ?? null;
      if (source === previousSource) {
        return previousValue;
      }
      previousSource = source;
      previousValue = source === null ? null : scopeProject(ref.environmentId, source);
      return previousValue;
    }).pipe(Atom.withLabel(`environment-project:${key}`));
  });

  let previousProjectRefs: ReadonlyArray<ScopedProjectRef> = [];
  const projectRefsAtom = Atom.make((get) => {
    const refs: ScopedProjectRef[] = [];
    for (const environmentId of get(input.catalogValueAtom).entries.keys()) {
      refs.push(...get(environmentProjectRefsAtom(environmentId)));
    }
    if (projectRefsEqual(previousProjectRefs, refs)) {
      return previousProjectRefs;
    }
    previousProjectRefs = refs;
    return refs;
  }).pipe(Atom.withLabel("environment-project-refs"));

  let previousProjects: ReadonlyArray<EnvironmentProject> = [];
  const projectsAtom = Atom.make((get) => {
    const next = get(projectRefsAtom).flatMap((ref) => {
      const project = get(projectAtomFamily(projectKey(ref)));
      return project === null ? [] : [project];
    });
    if (arrayElementsEqual(previousProjects, next)) {
      return previousProjects;
    }
    previousProjects = next;
    return previousProjects;
  }).pipe(Atom.withLabel("environment-project-list"));

  const projectAtom: EnvironmentProjectAtomAccessor = (ref: ScopedProjectRef) =>
    projectAtomFamily(projectKey(ref));
  latestEnvironmentProjectAtomAccessor = projectAtom;

  return {
    environmentProjectsAtom,
    environmentProjectIndexAtom,
    environmentProjectRefsAtom,
    projectRefsAtom,
    projectsAtom,
    projectAtom,
  };
}
