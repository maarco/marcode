# Upstream sync handoff — pingdotgg/t3code@ba9c9ae81dce

**Status: BLOCKED on an architecture decision. Not merged, not pushed as a merge commit.**

The daily sync bot has been failing since Aug 3. It files a new `upstream-sync-blocked`
issue every day (#10, #11, #12, #13, #14, #15) because `main` never advanced past the last
successful merge, so every run re-plans the same growing delta from the same merge base.
Eight days of upstream drift accumulated: **140 commits, 41 conflicted files, ~150 conflict
hunks.**

| field                               | value                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| upstream source                     | `ba9c9ae81dce4e554b4dd52abfd28d0c01b5c651` (`fix(server): one greedy agent process no longer takes down the whole server (#5788)`) |
| last upstream sha already in `main` | `5192f777fe54c2a2a359f6c25ecf5fbde46d49b0`                                                                                         |
| target base                         | `origin/main` = `d0c01668c0f87b10bf952f929c55c7a8ca818fdf`                                                                         |
| new upstream commits                | 140                                                                                                                                |
| conflicted files                    | 41                                                                                                                                 |

Note: PR #9 (bot sync through `e60821f0e0d8`) is still open and draft. It is a strict subset
of this delta and should be closed in favour of whatever lands from this work.

---

## Why this is blocked

Upstream commit `0de95407 feat: sidebar v2 is now the default sidebar` **restructured the
entire sidebar**:

- old `Sidebar.tsx` → renamed to `LegacySidebar.tsx`
- `SidebarV2.tsx` → promoted to `Sidebar.tsx` (deleted as a separate file)
- setting `sidebarV2Enabled` (opt-in v2) → replaced by `legacySidebarEnabled` (opt-in legacy)

Marcode's `Sidebar.tsx` is its own unified workspace tree — a documented non-negotiable
product contract and a manifest hotspot. Git therefore aligns Marcode's ~8,000-line
customized sidebar against upstream's newly-promoted v2 implementation. **Sidebar.tsx alone
has ~5,100 lines inside conflict regions**, including one hunk of 921 Marcode lines against
2 upstream lines, and another of 39 Marcode lines against 527 upstream lines.

The settings contract now carries **both** flags after a clean merge:

- `legacySidebarEnabled` (upstream, default `false`)
- `unifiedWorkspaceSidebar` (Marcode, default `true`)

These are two overlapping opt-out axes for "which sidebar do I get", and Marcode's
`useSidebarV2Enabled` hook is gone. **Deciding what those two flags mean together is a
product decision, not a merge mechanic.** Resolving it by taking either side wholesale is
explicitly forbidden by both `AGENTS.md` and the upstream-sync runbook, and the runbook
additionally requires driving the real UI at 390px and 820px before any resolution in these
files can be trusted — which this headless container cannot do.

So the sync stops here rather than inventing an answer unattended.

### The 8 files that need your decision

| file                                                | hunks | why                                                                           |
| --------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `apps/web/src/components/Sidebar.tsx`               | 18    | unified workspace tree vs promoted sidebar v2                                 |
| `apps/web/src/components/RightPanelTabs.tsx`        | 12    | Marcode multi-surface right panel                                             |
| `apps/web/src/components/ChatView.tsx`              | 10    | Marcode workspace/terminal/browser integration                                |
| `apps/web/src/components/ProjectScriptsControl.tsx` | 9     | unified-workspace command placement                                           |
| `apps/web/src/components/ThreadTerminalDrawer.tsx`  | 7     | Marcode terminal surface                                                      |
| `apps/web/src/index.css`                            | 7     | `data-sidebar-version` → `data-app-sidebar` selector rename + Marcode palette |
| `apps/web/src/components/chat/ChatHeader.tsx`       | 5     | Marcode portals thread actions into FloatingPillNav                           |
| `apps/web/src/components/AppSidebarLayout.tsx`      | 5     | v1/v2 mount logic vs Marcode floating shell                                   |

Plus 4 smaller ones that fall out of the same decision:
`apps/web/src/rightPanelStore.ts` (6), `apps/web/src/components/sidebar/SidebarChrome.tsx` (3),
`scripts/mobile-showcase-environment.ts` (3), `apps/web/src/rightPanelStore.test.ts` (1),
`apps/web/src/hooks/useHandleNewThread.ts` (1),
`apps/web/src/components/settings/SettingsPanels.tsx` (1).

---

## What IS resolved and verified

27 conflicted files plus 16 more files fixed for fork-boundary breaks. All resolutions are in
`resolutions.patch` in this directory. Verification run:

- `vp run --filter @t3tools/contracts typecheck` — clean
- `vp run --filter @t3tools/client-runtime typecheck` — clean
- `vp run --filter t3 typecheck` — clean
- `vp test run` on 5 focused server suites — **44 passed**
- `vp test run` on client-runtime pagination + project grouping — **18 passed**

No UI verification was performed (see above). No web package typecheck yet — it cannot pass
while the 8 files above still hold conflict markers.

### Silent fork-boundary breaks found (merged clean, produced NO conflict)

These are the dangerous class. Each one would have shipped a quietly broken Marcode.

1. **Theme boot script reads the wrong storage key.** Upstream's new inline boot script in
   `apps/web/index.html` reads `localStorage["t3code:theme"]`; Marcode's `useTheme.ts`
   renamed the key to `"marcode:theme"`. Every page load would flash the wrong theme before
   React mounted. Fixed in `index.html`, `themeBoot.test.ts`, `useTheme.test.ts`.
   (The other theme keys — `t3code:themes:v1`, `theme-halves`, etc. — are internally
   consistent compatibility identifiers and were deliberately left upstream-shaped.)

2. **New `appearanceFonts.ts` didn't mirror Marcode's fonts.** Upstream's new
   Settings → Appearance feature documents its default stacks as mirroring `index.css` and
   shows the resolved "Default" family name to users. Upstream's stacks are system fonts;
   Marcode's are Inter / JetBrains Mono. Updated the mirror.

3. **`--share` bundled-dev speedup would never apply.** Upstream's new dev-runner sets
   `T3CODE_BUNDLED_DEV=1` for shared runs; Marcode's `vite.config.ts` reads
   `MARCODE_BUNDLED_DEV`. Renamed in `dev-runner.ts` + `dev-runner.test.ts`.

4. **New desktop early-startup read the wrong home var.** `DesktopEarlyElectronStartup.ts`
   (new upstream file) read `env.T3CODE_HOME`; every Marcode writer sets `MARCODE_HOME`.

5. **New shared desktop path helper defaulted to `~/.t3`.** `DesktopStatePaths.ts` (new
   upstream file) hardcoded `.t3` as the default base dir; Marcode's is `.marcode`. This fed
   both the new early-startup path and `DesktopEnvironment`.

6. **`t3 pair` looked in the wrong home.** `apps/server/src/cli/pair.ts` read
   `Config.string("T3CODE_HOME")`. This is the documented pairing-token recovery command.

7. **New `migrate-dev-db` script pointed at `~/.t3`.** Upstream's new
   `vp run migrate-dev-db` imported `resolveWorktreeT3Home` (Marcode renamed it to
   `resolveWorktreeMarcodeHome`, so it didn't even compile) and defaulted its source database
   to `~/.t3/userdata/state.sqlite`, which does not exist on Marcode.

8. **Upstream's new boot-service test hardcoded `t3code.service`.** Marcode's unit is
   `marcode.service`. Fixed inside the new test block.

9. **`projector.ts` — git mis-aligned the hunks.** Upstream's two new `project.updated`
   fields (`defaultThreadEnvMode`, `faviconPath`) were aligned against Marcode's _different_
   `project.workspace-layout-applied` handler. Taking either side would have silently dropped
   upstream's new fields from the project-updated path. Both were added explicitly.

### Migration renumbering (correctness-critical)

Marcode owns migration **33 = `ProjectWorkspaceLayout`**, so every shared migration sits one
id higher than upstream. Upstream added its new migrations as 36–40, which collide with
Marcode's existing 36 (`ProjectionThreadTitleRegeneration`). Renumbering an already-applied
id would re-run or skip it on existing installs.

Upstream 36→41 were shifted to **37–41** (files renamed via `git mv`, registry and the
`041_…` test label updated):

| id  | migration                                              |
| --- | ------------------------------------------------------ |
| 33  | `ProjectWorkspaceLayout` (Marcode)                     |
| 34  | `ProjectionThreadsSettled`                             |
| 35  | `ProjectionThreadsSnoozed`                             |
| 36  | `ProjectionThreadTitleRegeneration`                    |
| 37  | `ProjectionThreadsPinned` (upstream 36)                |
| 38  | `ProjectionTurnsKeysetIndex` (upstream 37)             |
| 39  | `ProjectionThreadsPinOrderKey` (upstream 38)           |
| 40  | `ProjectionProjectsDefaultThreadEnvMode` (upstream 39) |
| 41  | `ProjectionProjectFaviconPath` (upstream 40)           |

### Other notable decisions

- **`apps/server/src/http.ts`** — took upstream's replacement of the hand-rolled gzip helper
  with `HttpMiddleware.compression()`, kept Marcode's `marcode://app` / `marcode-dev://app`
  desktop renderer origins. Marcode really does register the `marcode://` scheme
  (`ElectronProtocol.ts`), so the CORS allowlist must carry it or the desktop renderer's own
  requests get rejected.
- **`bootService.test.ts`** — upstream's headline fix for this sync is
  `KillMode=mixed` + `OOMPolicy=continue` so one OOM-killed agent no longer takes down the
  server. Kept Marcode's paths/identity test AND added upstream's new OOM test.
  `T3_BOOT_SERVICE_UNIT` deliberately stays upstream-shaped.
- **`threadSnapshotHttp.ts` / `threads.ts`** — both sides changed the same signature. Marcode
  replaced `Option` with a three-state `found | missing | unavailable` result (so a deleted
  thread stops being re-fetched forever); upstream added a pagination `window` parameter.
  Combined both, and adapted upstream's second call site (`loadOlderTurns`) plus its
  pagination test harness. Upstream's 18 pagination tests pass against the combined shape.
- **`index.css`** — took upstream's architectural move of `--font-sans`/`--font-mono` out of
  `@theme inline` into a plain `@theme` block (required for the new runtime font override),
  populated with Marcode's Inter/JetBrains stack. Took upstream's removal of
  `--animate-sidebar-working-text` (they stopped the sidebar "Working" label pulsing; nothing
  referenced the token).
- **`tooltip.tsx`** — upstream bumped the tooltip from `z-50` to `z-70` so tooltips overlay
  popovers and menus. Marcode routes overlay z-index through the inline `floating-surface-z`
  scale, where a utility class is inert. Preserved upstream's actual intent by adding a
  `portalOverlayTooltip: 13150` tier just above `portalOverlay`. **This touches Marcode's
  floating-surface z contract — worth a look.**
- **`.env.example`** — upstream now ships production T3 Connect config by default. Took it,
  renamed `T3CODE_*` → `MARCODE_*` to match every consumer. The endpoints
  (`clerk.t3.codes`, `relay.t3.codes`) are the backend Marcode already rides on.
- **`FilePreviewPanel.tsx`** — modify/delete conflict. Marcode retired the right-panel file
  surface (documented contract, floating editor owns file editing) and nothing imports it, so
  the deletion stands.
- **`pnpm-lock.yaml`** — regenerated with `pnpm install`, not hand-edited.
- **Coupled subtrees** — neither `pnpm-workspace.yaml` nor `infra/relay/package.json` moved
  in a way that requires `sync:repos`; no vendored subtree sync was needed.

---

## How to resume

`resolved-files.tar.gz` holds the final content of all 48 hand-resolved files;
`resolved-files.txt` lists them. Unpacking it over a freshly reproduced merge takes the
conflict count from **41 down to exactly the 14** listed above. This recipe was verified
end-to-end: the resulting tree is byte-identical to the state the tests above were run
against.

```sh
git fetch origin main
git switch --create integrate/upstream-ba9c9ae81dce origin/main
git fetch https://github.com/pingdotgg/t3code.git main
git merge --no-ff ba9c9ae81dce4e554b4dd52abfd28d0c01b5c651   # 41 conflicts

H=docs/operations/upstream-sync-handoffs/ba9c9ae81dce

# 1. final content of every already-resolved file
tar xzf "$H/resolved-files.tar.gz"

# 2. Marcode's deletion of the retired right-panel file surface
git rm -f apps/web/src/components/files/FilePreviewPanel.tsx

# 3. drop upstream's original migration numbering (renumbered to 037-041 in the archive)
rm -f apps/server/src/persistence/Migrations/036_ProjectionThreadsPinned.ts \
      apps/server/src/persistence/Migrations/037_ProjectionTurnsKeysetIndex.ts \
      apps/server/src/persistence/Migrations/038_ProjectionThreadsPinOrderKey.ts \
      apps/server/src/persistence/Migrations/039_ProjectionProjectsDefaultThreadEnvMode.ts \
      apps/server/src/persistence/Migrations/040_ProjectionProjectFaviconPath.ts \
      apps/server/src/persistence/Migrations/040_ProjectionProjectFaviconPath.test.ts

# 4. stage them
xargs -a "$H/resolved-files.txt" git add

git diff --name-only --diff-filter=U   # the 14 that need your decision
```

Then resolve those 14 by hand and drive the UI at 390px and 820px before trusting the
result.

A note on the deletes in steps 2 and 3: they only remove paths this writeup already accounts
for — the retired `FilePreviewPanel`, and upstream's pre-renumbering migration filenames whose
renamed copies the archive restores. Nothing else is touched. Do not reach for
`git checkout --ours/--theirs`, `reset`, `restore`, `stash`, `clean`, or a force push to get
through the remaining 14.
