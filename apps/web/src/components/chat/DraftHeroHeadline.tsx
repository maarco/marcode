import type { ScopedProjectRef } from "@t3tools/contracts";
import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import { FolderPlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { INTRO_MESSAGES } from "~/content/introMessages";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useClientSettings } from "~/hooks/useSettings";
import { selectProjectGroupingSettings } from "~/logicalProject";
import {
  buildSidebarProjectPickerEntries,
  buildSidebarProjectSnapshots,
} from "~/sidebarProjectGrouping";
import { useProjects, useThreadShells } from "~/state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { sortLogicalProjectsForSidebar } from "../Sidebar.logic";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";

interface DraftHeroHeadlineProps {
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly activeProjectTitle: string | null;
}

const MENTIKO_GIF_TEXT_SOURCE = "https://assets.amarn.me/gif-text.gif";

type GifTextStatus = "loading" | "ready" | "failed";

export function DraftHeroHeadline({
  activeProjectRef,
  activeProjectTitle,
}: DraftHeroHeadlineProps) {
  const projects = useProjects();
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const projectSortOrder = useClientSettings((settings) => settings.sidebarProjectSortOrder);
  const handleNewThread = useNewThreadHandler();
  const openAddProject = useCallback(() => openCommandPalette({ open: "add-project" }), []);
  const [gifTextStatus, setGifTextStatus] = useState<GifTextStatus>("loading");
  const [introMessage] = useState(
    () =>
      INTRO_MESSAGES[Math.floor(Math.random() * INTRO_MESSAGES.length)] ?? "What should we build?",
  );

  useEffect(() => {
    const image = new Image();
    image.src = MENTIKO_GIF_TEXT_SOURCE;
    image.onload = () => setGifTextStatus("ready");
    image.onerror = () => setGifTextStatus("failed");

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, []);

  const headlineTextClassName =
    gifTextStatus === "ready"
      ? "draft-hero-headline-gif-text"
      : gifTextStatus === "loading"
        ? "text-muted-foreground/70 animate-pulse"
        : "text-foreground";

  const environmentLabelById = useMemo(
    () =>
      new Map(
        environments.map((environment) => [environment.environmentId, environment.label] as const),
      ),
    [environments],
  );
  const projectGroups = useMemo(
    () =>
      sortLogicalProjectsForSidebar(
        buildSidebarProjectSnapshots({
          projects,
          settings: projectGroupingSettings,
          primaryEnvironmentId,
          resolveEnvironmentLabel: (environmentId) =>
            environmentLabelById.get(environmentId) ?? null,
        }),
        threads,
        projectSortOrder,
      ),
    [
      environmentLabelById,
      primaryEnvironmentId,
      projectGroupingSettings,
      projectSortOrder,
      projects,
      threads,
    ],
  );
  const projectPickerEntries = useMemo(
    () =>
      buildSidebarProjectPickerEntries({
        groups: projectGroups,
        preferredProjectRef: activeProjectRef,
      }),
    [activeProjectRef, projectGroups],
  );
  const projectEntryByKey = useMemo(
    () => new Map(projectPickerEntries.map((entry) => [entry.group.projectKey, entry] as const)),
    [projectPickerEntries],
  );
  const activeProjectGroup =
    activeProjectRef === null
      ? null
      : (projectGroups.find((group) =>
          group.memberProjectRefs.some(
            (projectRef) => scopedProjectKey(projectRef) === scopedProjectKey(activeProjectRef),
          ),
        ) ?? null);
  const activeProjectKey = activeProjectGroup?.projectKey ?? "";
  const activeProjectDisplayName = activeProjectGroup?.displayName ?? activeProjectTitle;
  const hasResolvedProject = activeProjectTitle !== null;
  const canChooseProject = projectPickerEntries.length > 0;
  const shouldShowProjectMenu = canChooseProject;

  const projectSelector = shouldShowProjectMenu ? (
    <Menu>
      <MenuTrigger
        aria-label={hasResolvedProject ? "Change project" : "Choose a project"}
        className={`pointer-events-auto inline cursor-pointer border-current border-b border-dotted underline-offset-8 transition-opacity hover:opacity-75 focus-visible:rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${headlineTextClassName}`}
      >
        {activeProjectDisplayName ?? "Choose a project"}
      </MenuTrigger>
      <MenuPopup align="center" className="max-h-80 w-64 overflow-y-auto">
        <MenuRadioGroup
          value={activeProjectKey}
          onValueChange={(value) => {
            const entry = projectEntryByKey.get(value as string);
            if (!entry || value === activeProjectKey) {
              return;
            }
            const project = entry.targetProject;
            void handleNewThread(scopeProjectRef(project.environmentId, project.id), {
              replace: true,
            });
          }}
        >
          {projectPickerEntries.map(({ group }) => {
            return (
              <MenuRadioItem key={group.projectKey} value={group.projectKey} closeOnClick>
                <span className="min-w-0 truncate">{group.displayName}</span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onClick={openAddProject}>
          <FolderPlusIcon />
          New project
        </MenuItem>
      </MenuPopup>
    </Menu>
  ) : (
    <button
      type="button"
      onClick={openAddProject}
      className={`pointer-events-auto inline cursor-pointer border-current border-b border-dotted underline-offset-8 transition-opacity hover:opacity-75 focus-visible:rounded-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${headlineTextClassName}`}
    >
      {activeProjectTitle ?? "Add a project"}
    </button>
  );

  const headlineMessage =
    hasResolvedProject && introMessage.endsWith("?") ? (
      <>
        <span className={headlineTextClassName}>{introMessage.slice(0, -1)} in</span>{" "}
        {projectSelector}
        <span className={headlineTextClassName}>?</span>
      </>
    ) : (
      <span className={headlineTextClassName}>{introMessage}</span>
    );

  return (
    <h1 className="mx-auto w-full max-w-5xl px-2 text-center font-black text-5xl text-foreground leading-[0.95] tracking-tight sm:px-6 sm:text-6xl">
      {hasResolvedProject ? (
        headlineMessage
      ) : canChooseProject ? (
        <>{projectSelector} to start</>
      ) : (
        <>Add a project to start</>
      )}
    </h1>
  );
}
