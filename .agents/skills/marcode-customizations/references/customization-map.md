# Marcode customization map

Baseline: local `main` at `54a1cba9`, audited 2026-07-26.

This is a routing map, not a substitute for reading source. Check the affected files and their Git
history after the baseline before relying on a claim.

## Repository boundary

- Official source: `https://github.com/pingdotgg/t3code.git`, branch `main`.
- Marcode target: `https://github.com/maarco/marcode.git`, branch `main`.
- Policy: `.github/upstream-sync.yml`.
- Runbook: `docs/operations/upstream-sync.md`.
- Automation: `scripts/upstream-sync.ts`, `scripts/lib/upstream-sync-config.ts`,
  `scripts/lib/upstream-sync-git.ts`, and `.github/workflows/upstream-sync.yml`.
- Focused tests: `scripts/upstream-sync.test.ts`, `scripts/upstream-sync-workflow.test.ts`,
  `scripts/lib/upstream-sync-config.test.ts`, and `scripts/lib/upstream-sync-git.test.ts`.

The manifest's hotspots are the fastest current inventory of conflict-sensitive fork paths. Review
it before changing this map.

## Product identity, release channels, and assets

Source owners:

- Web branding: `apps/web/src/branding.ts`, `apps/web/src/branding.logic.ts`.
- Web mark: `apps/web/src/components/MarcodeMark.tsx`.
- Desktop identity: `apps/desktop/src/app/DesktopEnvironment.ts`,
  `apps/desktop/src/app/DesktopAppIdentity.ts`, and `apps/desktop/scripts/electron-launcher.mjs`.
- Desktop package name: `apps/desktop/package.json`.
- Packaged icons and marks: `assets/dev`, `assets/nightly`, `assets/prod`,
  `apps/desktop/resources`, `apps/web/public`, and root `favicon.svg`.
- Mobile and marketing user surfaces: `apps/mobile` and `apps/marketing`.

Current rule:

- Visible product name is `Marcode`, with environment/release labels such as Dev, Nightly, or Alpha.
- Keep compatibility names that are still upstream-owned or migration-sensitive. Do not broadly
  rename `@t3tools/*`, storage keys, mobile schemes/bundle ids, or package names.
- A mark or channel change requires a sibling sweep across web, desktop, mobile, marketing, and
  generated assets.

Representative tests:

- `apps/web/src/branding.test.ts`
- `apps/desktop/src/app/DesktopAppIdentity.test.ts`
- `apps/desktop/src/window/DesktopApplicationMenu.test.ts`

## Floating shell and navigation

Source owners:

- Navigation: `apps/web/src/components/FloatingPillNav.tsx`
- Workspace action receiver: `apps/web/src/components/ChatView.tsx`
- Right-panel state: `apps/web/src/rightPanelStore.ts`
- Right-panel rendering: `apps/web/src/components/RightPanelTabs.tsx`
- Floating editor host: `apps/web/src/editor/floating-code-pill.tsx`
- Shared layer scale: `apps/web/src/editor/floating-surface-z.ts`
- Modal click guard: `apps/web/src/lib/modalLayer.ts`
- Global visual tokens/chrome: `apps/web/src/index.css`

Current ownership:

- Files → floating editor, file sidebar selected.
- Diff/plan/browser/terminal → right panel as appropriate.
- Unified workspace live nodes may activate terminal and browser resources without taking ownership
  of their durable runtime state.
- Legacy persisted right-panel `file` and `files` surfaces are dropped during migration.
- The pill nav stays above application and portal layers; do not solve one popup with a local
  arbitrary z-index.

Sibling checks:

- Draft routes versus started server threads.
- Local versus remote/disconnected environments.
- Nav tooltip/dropdown close behavior.
- Browser/terminal right-panel activation.
- Narrow and desktop viewports.

## Unified project workspace

Contracts and ordering:

- `packages/contracts/src/projectWorkspace.ts`
- `packages/contracts/src/orchestration.ts`
- `packages/shared/src/fractionalRank.ts`

Server command and persistence path:

- `apps/server/src/orchestration/decider.ts`
- `apps/server/src/orchestration/commandInvariants.ts`
- `apps/server/src/orchestration/projector.ts`
- `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`
- `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- `apps/server/src/persistence/Migrations/033_ProjectWorkspaceLayout.ts`
- `apps/server/src/persistence/Layers/ProjectionProjects.ts`

Client runtime:

- `packages/client-runtime/src/operations/projectWorkspace.ts`
- `packages/client-runtime/src/state/projectCommands.ts`

Web projection and rendering:

- `apps/web/src/unifiedWorkspace`
- `apps/web/src/components/unified-workspace`
- `apps/web/src/components/Sidebar.tsx`
- `packages/contracts/src/settings.ts`

Reference and behavior docs:

- `docs/reference/project-workspace-layout.md`
- `docs/specs/unified-workspace-tree-sidebar.md`
- `docs/specs/unified-workspace-sidebar-editor-parity.md`
- `docs/user/unified-workspace-sidebar.md`
- `.agents/skills/unified-workspace-sidebar/SKILL.md`

Current rule:

- Persist layout placement, labels, and shortcuts.
- Project live threads, scripts, terminals, previews, and indexed disk paths into the rendered tree.
- Do not persist terminal or browser instances.
- Keep ambient disk projection lazy and index-backed; attached paths render once at their persisted
  placement.
- Qualify rendered ids by environment and project.
- Reject stale version, cross-project moves, cycles, bad parents, invalid paths, and invalid resource
  materialization server-side.

Representative tests:

- `packages/contracts/src/projectWorkspace.test.ts`
- `packages/shared/src/fractionalRank.test.ts`
- `packages/client-runtime/src/operations/projectWorkspace.test.ts`
- `apps/server/src/orchestration/decider.workspaceLayout.test.ts`
- `apps/server/src/orchestration/commandInvariants.test.ts`
- `apps/server/src/orchestration/projector.workspaceLayout.test.ts`
- `apps/web/src/unifiedWorkspace/buildTree.test.ts`
- `apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.logic.test.ts`

## Floating editor and shared file state

Shared client state:

- `apps/web/src/state/projectFileState.ts`
- `apps/web/src/components/files/projectFilesQueryState.ts`
- `apps/web/src/components/files/fileSaveCoordinator.ts`

Editor identity and behavior:

- `apps/web/src/editor/editor-store.ts`
- `apps/web/src/editor/editor-pane.tsx`
- `apps/web/src/editor/editor-surface.ts`
- `apps/web/src/editor/open-floating-file.ts`
- `apps/web/src/editor/floating-code-pill.tsx`
- `apps/web/src/editor/file-tree.tsx`
- `apps/web/src/editor/quick-open.tsx`
- `apps/web/src/editor/search-panel.tsx`
- `apps/web/src/editor/git-panel.tsx`
- `apps/web/src/editor/branch-selector.tsx`
- `apps/web/src/editor/stash-selector.tsx`
- `apps/web/src/editor/tab-bar.tsx`

Entry points:

- Unified tree: `apps/web/src/unifiedWorkspace/useUnifiedWorkspaceProject.ts`
- Chat file links: `apps/web/src/components/ChatMarkdown.tsx`
- Diff actions: `apps/web/src/diffFileActions.ts`
- Workspace Files action: `apps/web/src/components/FloatingPillNav.tsx` →
  `apps/web/src/components/ChatView.tsx`

Transport and server owners:

- RPC contracts: `packages/contracts/src/project.ts`, `packages/contracts/src/git.ts`,
  `packages/contracts/src/rpc.ts`
- Client RPC/state: `packages/client-runtime/src/rpc/client.ts`,
  `packages/client-runtime/src/state/projectCommands.ts`,
  `packages/client-runtime/src/state/vcs.ts`
- Server RPC dispatch: `apps/server/src/ws.ts`
- Filesystem: `apps/server/src/workspace/WorkspaceFileSystem.ts`
- Git workflow: `apps/server/src/git/GitWorkflowService.ts`
- VCS driver: `apps/server/src/vcs/GitVcsDriver.ts`,
  `apps/server/src/vcs/GitVcsDriverCore.ts`

Retired surface:

- `apps/web/src/components/files/FileBrowserPanel.tsx` and
  `apps/web/src/components/files/FilePreviewPanel.tsx` were removed.
- `apps/server/src/editor/editorHttpRoutes.ts` was removed.
- `apps/web/src/rightPanelStore.ts` has no live file/files surface kind.

Current rule:

- One real-file buffer per environment, workspace root, and relative path.
- Editor tab/cache identity includes environment plus absolute path.
- Reads, optimistic updates, autosave, explicit flush, revert, and error state share one data layer.
- Failed, unloaded, binary, unscoped, and truncated inputs must not become an empty writable editor.
- A confirmed truncated read cannot be saved back as a shortened file.
- Closing a real tab flushes pending autosave.
- File-opening entry points use `openFileInFloatingEditor`; they do not invent another surface.

Representative tests:

- `apps/web/src/state/projectFileState.test.ts`
- `apps/web/src/components/files/projectFilesQueryState.test.ts`
- `apps/web/src/components/files/fileSaveCoordinator.test.ts`
- `apps/web/src/editor/editor-store.test.ts`
- `apps/web/src/editor/editor-surface.test.ts`
- `apps/web/src/editor/open-floating-file.test.ts`
- `apps/server/src/workspace/WorkspaceFileSystem.test.ts`
- `apps/server/src/vcs/GitVcsDriverCore.test.ts`

Decision history:

- `docs/specs/editor-file-state-unification.md`
- `docs/specs/single-editing-surface.md`
- `docs/specs/unified-workspace-editor-merge.md`

## Skill ownership

- General fork boundary: `.agents/skills/marcode-customizations`
- Skill drift and upstream re-verification: `.agents/skills/marcode-skill-upkeep`
- Unified sidebar behavior and testing: `.agents/skills/unified-workspace-sidebar`
- Web runtime verification: `.agents/skills/test-t3-app`
- Mobile runtime verification: `.agents/skills/test-t3-mobile`
- Native iOS verification: `.agents/skills/ios-debugger-agent` and
  `.agents/skills/ios-simulator-browser`

When a new Marcode-only subsystem lands:

1. Add its hotspot when upstream can touch the same source boundary.
2. Add or update the decision/spec documentation.
3. Update this map with live source owners and representative focused tests.
4. Add a sibling skill only when the subsystem has a repeatable workflow substantial enough to need
   its own operating instructions.
