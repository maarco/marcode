# Unified Workspace Sidebar → Sidebar V2 Port

Status: implementation-ready spec
Scope: `apps/web` (browser + Electron), including the responsive sidebar sheet
Baseline verified: `d3154f092` on 2026-07-31
Ship as: `docs/specs/unified-workspace-sidebar-v2-port.md` (step 0 of execution)

---

## 1. Context

Marcode's unified workspace tree is mounted **only** inside `apps/web/src/components/Sidebar.tsx`
(sidebar v1). Two facts make that a problem right now:

1. **Upstream is deleting v1.** `upstream/agent/sidebar-v2-only` (`c5610286c`) removes
   `Sidebar.tsx` entirely — 3,642 lines — and makes `SidebarV2.tsx` the only sidebar. Marcode has
   **+690 / −124** lines of its own inside that file (~290 of them the seam component itself,
   `SidebarProjectWorkspaceTree`, Sidebar.tsx:1083–1374). When that lands, the sync produces a
   delete/modify conflict over 690 lines of our code.
2. **The tree is already invisible in dev.** `resolveSidebarV2Default` (branding.logic.ts:22)
   returns true for stage `"Dev"` and `"Nightly"`; `APP_STAGE_LABEL` is `"Dev"` under
   `import.meta.env.DEV`. Since `SidebarV2.tsx` contains **zero** unified-workspace references, any
   local dev run without an explicit Beta opt-out already shows v2 — with no tree.

Outcome: the tree becomes a first-class part of v2, ~90% of the feature stays in Marcode-owned
paths, and the code left inside upstream's file shrinks from ~690 lines to ~10.

## 2. Decisions (locked)

| #   | Decision                                                                                                                         | Consequence                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Project scope swaps the list.** `All projects` keeps v2's flat inbox; selecting a project renders that project's tree instead. | Reuses `projectScopeKey`/`scopedProjectGroup` (SidebarV2.tsx:1373–1396). No new nav concept.                                                                                  |
| D2  | **Settled/snoozed fold into the tree.** No shelves in tree mode.                                                                 | Preserves "every unarchived thread renders exactly once." Requires settle/snooze parity in the row menu (§6.3) or scoping to a project silently removes a core v2 capability. |
| D3  | **Flip Marcode's default to v2.**                                                                                                | `resolveSidebarV2Default` returns true for every stage. Alpha/production builds get v2 + tree instead of v1.                                                                  |

## 3. Current source truth (measured against `upstream/main`)

- Marcode-owned, **zero conflict surface**: `apps/web/src/unifiedWorkspace/**` +
  `apps/web/src/components/unified-workspace/**` — 6,532 lines. Upstream never touches these paths.
- Inside upstream files: `Sidebar.tsx` +690/−124, `Sidebar.logic.ts` +44/−1,
  `AppSidebarLayout.tsx` +38/−68.
- `SidebarV2.tsx` — **0 diff. pristine upstream.**
- `.github/upstream-sync.yml` hotspots cover `Sidebar.tsx`, `Sidebar.logic*`, `AppSidebarLayout.tsx`.
  They do **not** cover `SidebarV2.tsx` or `branding.logic*` — both are touched by this work.

Everything the seam needs already exists in `SidebarV2()`: `useThreadActions` (:1183),
`confirmThreadDelete` (:1179), `copyPathToClipboard` (:1194), `markThreadUnread` (:1246),
`openPrLink` (:451), `useSidebar()` → `isMobile` (:1176), `routeThreadKey` (:1258).

Verified: all twelve props v1 threads into the seam are reconstructible inside a Marcode-owned
component — five are plain hooks, `attemptArchiveThread` is a 15-line `useCallback` over
`useThreadActions().archiveThread` (Sidebar.tsx:2367), and the thread lookup derives from the
threads list. Thread creation with placement needs **no** new wiring: `useUnifiedWorkspaceProject`
already owns it via `useHandleNewThread`.

## 4. Target seam shape

New Marcode-owned component owns everything: the tree, the grouped-member picker, the Add-item
menu, and its own hook calls. What lands in `SidebarV2.tsx` is one import plus one conditional:

```tsx
{!isSearchingThreads && workspaceTreeProject ? (
  <UnifiedWorkspaceSidebarSection
    projectGroup={workspaceTreeProject}
    activeRouteThreadKey={routeThreadKey}
  />
) : (
  /* existing flat list, unchanged */
)}
```

`workspaceTreeProject` comes from a pure helper in our own logic file, not from inline logic in
upstream's component.

## 5. Execution phases

### Phase 1 — Extract the seam (no behavior change)

Move `SidebarProjectWorkspaceTree` (Sidebar.tsx:1083–1374) out of the upstream file.

- **NEW** `apps/web/src/components/unified-workspace/UnifiedWorkspaceSidebarSection.tsx`
  - the moved component, renamed, plus the grouped-member picker block currently at
    Sidebar.tsx:2749–2814.
  - self-serves via hooks instead of props: `useThreadActions`, `useCopyToClipboard` (×2),
    `useUiStateStore`, `useOpenPrLink`, `useClientSettings`, `useSidebar`. Keep the
    `attemptArchiveThread` wrapper verbatim — do not write a second archive flow.
  - remaining props: `projectGroup: SidebarProjectSnapshot`, `activeRouteThreadKey: string | null`,
    and **optional** `addMenuSlotElement`. When the slot is null the section renders its own inline
    header row with the Add-item button; when present it portals as today. One prop, both hosts, no
    duplicated menu.
  - keeps the headless `ProjectScriptsControl` mount for "Add command" — do not re-implement it.
- **NEW** `apps/web/src/components/unified-workspace/UnifiedWorkspaceSidebarSection.logic.ts`
  - `resolveWorkspaceTreeMember(...)` — lifted from Sidebar.tsx:1558–1578 (auto-select the member
    owning the active thread, fall back to first). Both sidebars call it.
  - `resolveV2WorkspaceTreeProject({ featureEnabled, scopedProjectGroup, isSearching })`.
  - `shouldRenderUnifiedWorkspaceTree` stays in `Sidebar.logic.ts` (v1's expansion/pinning gating
    has no v2 analogue); the v2 helper is separate, not an overload.
- **EDIT** `apps/web/src/components/Sidebar.tsx` — delete the moved code, import from the new path,
  keep both existing mount points and the portal slot. Net ≈ **−290 lines** from the upstream file.

Gate: v1 behaves identically. Existing unified-workspace tests pass untouched.

### Phase 2 — Mount in v2

- **EDIT** `apps/web/src/components/SidebarV2.tsx` (~10 lines) — import + the conditional in §4,
  inside the `SidebarGroup` at :2763, replacing the `!isSearchingThreads` list branch.
- Suppress v2's scoped empty state (:3001–3022) in tree mode — the tree owns its own empty state;
  both rendering produces a doubled message.
- Search wins: while `isSearchingThreads`, v2's flat search results render even under a project
  scope. The tree is the not-searching view.
- Grouped projects: the section renders the member picker when
  `projectGroup.memberProjects.length > 1`, exactly as v1 does.

### Phase 3 — Settle/snooze parity in tree rows (required by D2)

Folding the shelves means a scoped project loses settle/snooze unless the row menu carries them.

- Extend `UnifiedWorkspaceTreeThreadAction` with `settle | unsettle | snooze | unsnooze`.
- Handle them in the section using v2's existing flows (`attemptSettle` / `attemptUnsettle` /
  `attemptSnooze` / `attemptUnsnooze`, SidebarV2.tsx:2900–2903) — extract to a shared hook rather
  than copying the bodies.
- Gate each item on the environment capability flags v2 already reads:
  `capabilities.threadSettlement` / `capabilities.threadSnooze`.
- Context-menu items only. **No** new row chrome, no settled variant styling.

### Phase 4 — Default flip, hotspots, docs

- **EDIT** `apps/web/src/branding.logic.ts` — `resolveSidebarV2Default` returns `true`
  unconditionally (drop the stage check). Update `apps/web/src/branding.test.ts` to assert the
  Marcode default and keep the `configuredByUser` opt-out path covered — an explicit v1 choice in
  Settings → Beta must still win.
- **EDIT** `.github/upstream-sync.yml` — add hotspots:
  - `apps/web/src/components/SidebarV2.tsx`, owner `web-navigation`,
    reason "Marcode mounts the unified workspace tree in the scoped-project view"
  - `apps/web/src/branding.logic*`, owner `web-navigation`,
    reason "Marcode defaults sidebar v2 on for every stage"
- **EDIT** `docs/user/unified-workspace-sidebar.md` — the tree now appears by selecting a project in
  the sidebar header, not by expanding a project row.
- **EDIT** `.claude/skills/unified-workspace-sidebar/SKILL.md` — update the "Where it lives"
  integration-seam row and the enable-the-flag section (v2 is now the default host).

## 6. Behavior spec — tree mode

**6.1 Entry/exit.** Tree mode is on when the feature flag is on, a project scope is selected, and
search is empty. Changing scope back to `All projects` restores the flat inbox with its shelves.
Scope selection already persists in component state; this spec adds no new persistence.

**6.2 Contents.** Every unarchived, undeleted thread of the scoped project renders exactly once, at
its layout placement, alongside attached files/folders, live terminals, live browser tabs, URL
shortcuts, and commands. Settled and snoozed threads render as ordinary rows (D2). Archived and
deleted threads do not render — unchanged from today.

**6.3 Actions.** Row context menu carries the five existing actions plus the four from Phase 3.
`New child thread`, drag-and-drop, `Move to…`, `Remove from sidebar`, and `Pin shortcut` behave
exactly as in v1 — same controller, same server commands.

**6.4 Header.** The project filter, search box, New thread, and New project buttons are unchanged.
The Add-item (`+`) button renders in the section's own header row inside the content area.

**6.5 Not in scope.** Thread-row extras missing in v1's tree (PR badge, worktree badge, jump hint,
relative time) stay missing — porting is not the moment to close that gap. Named, not silently
dropped.

## 7. Invariants that must survive

From the spec's §16 and the skill's invariant list — a change that breaks any of these is wrong:

- every unarchived thread renders exactly once; an unplaced thread becomes a synthetic root entry;
- the layout stores placement, never runtime objects (terminals/browser tabs are synthesized);
- "Remove from sidebar" deletes nothing real;
- attaching a path never touches disk; a vanished path renders as a broken reference;
- no cycles, no cross-project moves — server is authoritative;
- `expectedVersion` conflicts never silently overwrite;
- old data decodes cleanly (`workspaceLayoutVersion` / `workspaceLayout` defaults);
- grouped projects retain one physical tree per member.

## 8. Tests

New/updated:

- `apps/web/src/components/unified-workspace/UnifiedWorkspaceSidebarSection.logic.test.ts` — member
  resolution (active-thread member wins, fallback, member disappears), and
  `resolveV2WorkspaceTreeProject` gating across flag off / no scope / searching.
- `apps/web/src/branding.test.ts` — default true for every stage; explicit user opt-out still wins.
- `apps/web/src/components/Sidebar.logic.test.ts` — unchanged expectations after the extraction
  (regression proof that Phase 1 changed nothing).

Run (per root `AGENTS.md`, focused only):

```sh
npx vp test run \
  apps/web/src/components/unified-workspace/UnifiedWorkspaceSidebarSection.logic.test.ts \
  apps/web/src/components/unified-workspace/UnifiedWorkspaceTree.logic.test.ts \
  apps/web/src/components/Sidebar.logic.test.ts \
  apps/web/src/branding.test.ts \
  apps/web/src/unifiedWorkspace/buildTree.test.ts \
  apps/web/src/unifiedWorkspace/treeOperations.test.ts \
  apps/web/src/unifiedWorkspace/activateNode.test.ts

npx vp test run \
  scripts/upstream-sync.test.ts \
  scripts/lib/upstream-sync-config.test.ts
```

Targeted typecheck for `apps/web` only — not repo-wide.

## 9. Live verification

Use `$test-t3-app` (one isolated environment, pairing URL). Do not verify on a shared session.

1. Fresh profile → v2 renders by default with no Beta toggle touched (proves Phase 4).
2. `All projects` → flat inbox with active cards, Snoozed and Settled shelves intact.
3. Select a project → tree renders; verify a thread, an attached file, a live terminal, and a live
   browser tab all appear under their placements.
4. Settle a thread from the tree row menu → it stays in place, does not vanish (proves D2 + Phase 3).
5. Type in search while scoped → flat search results; clear it → tree returns.
6. Group two checkouts → member picker appears, the member owning the active thread auto-selects,
   switching members swaps trees with no cross-project move offered.
7. Drag a thread under a folder, then `Move to…` → both persist across reload.
8. Attempt a cycle → rejected with an explanation.
9. Toggle v1 in Settings → Beta → tree still renders in v1 (proves Phase 1 preserved it).
10. 390px, 820px, desktop; both themes. Watch for new overflow in the section header row.

## 10. Risks

- **Phase 3 touches the thread-action union**, consumed by `UnifiedWorkspaceRow` and the tree's
  keyboard handling. Extend, never reshape — a rename ripples through the row and its tests.
- **The default flip is user-visible.** Anyone on an Alpha build wakes up in a different sidebar.
  The `configuredByUser` opt-out must keep working, or a user who deliberately chose v1 gets
  overridden.
- **`branding.logic.ts` is upstream-clean today.** Touching it creates a new conflict boundary; the
  hotspot entry is what makes that intentional rather than accidental. It resolves to "take
  upstream's deletion" once the v2-only branch lands and the flag disappears.
- **Not verified in this pass:** native mobile (`apps/mobile`) decode path. Out of scope, unchanged
  by this work, but stated rather than assumed.

## 11. Payoff

After this, when upstream lands `sidebar-v2-only` and deletes `Sidebar.tsx`, Marcode takes the
deletion clean — the feature is already out of the blast radius, and the remaining conflict is
~10 lines in `SidebarV2.tsx` plus a flag that upstream is removing anyway.
