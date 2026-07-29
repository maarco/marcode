# Project workspace layout

Reference for the persistent sidebar layout stored on each physical project. Behavior specification
lives in `docs/specs/unified-workspace-tree-sidebar.md`; this document is the data-model reference.

Not to be confused with `workspace-layout.md`, which documents the monorepo package layout.

## Rule

The sidebar tree is a projection over persistent project layout plus authoritative live resource
state. It stores placement and shortcuts — never copies of runtime objects or filesystem content.

Consequences that follow from that rule:

- Attaching a file or folder stores a project-relative reference. Nothing is copied, moved, renamed,
  or deleted on disk.
- Live terminals and browser tabs are projected from their existing registries. They are never
  written into layout, and closing one leaves no persisted trace.
- Project commands stay owned by `ProjectScript`. Layout stores only their placement.
- "Remove from sidebar" removes placement. It never deletes the underlying file, thread, terminal,
  browser tab, or command.

## Schema

Defined in `packages/contracts/src/projectWorkspace.ts`, exported from `@t3tools/contracts`.

### Identifiers

| Type                            | Notes                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `ProjectWorkspaceItemId`        | Branded trimmed non-empty string, unique within one physical project layout.      |
| `ProjectWorkspaceLayoutVersion` | Non-negative integer. Starts at `0`, increments once per accepted layout command. |
| `ProjectWorkspaceRank`          | Lexically comparable fractional rank for stable sibling ordering.                 |

Resource references use deterministic ids so a synthetic node and its materialized entry are the
same node:

- thread — `thread:<threadId>`, via `makeThreadWorkspaceItemId`
- command — `command:<scriptId>`, via `makeCommandWorkspaceItemId`

Attachment and shortcut entries use the ambient UUID convention.

Array index is never durable order. Ranks come from `@t3tools/shared/fractional-rank`, which
generates a midpoint between two neighbors and compacts a sibling list when no midpoint remains.

### Entries

Every entry carries `id`, `parentId` (`null` at project root), and `rank`. Variants:

| `kind`    | Extra fields                     |
| --------- | -------------------------------- |
| `file`    | `relativePath`, optional `label` |
| `folder`  | `relativePath`, optional `label` |
| `thread`  | `threadId`                       |
| `command` | `scriptId`                       |
| `url`     | `label`, `url`                   |

Files and folders may contain sidebar children. That is an organizational relationship only — it
does not imply a file is a directory on disk, and an attached folder does not expand its physical
descendants. Threads may contain other threads. Commands, URLs, terminals, and browser tabs are
leaves.

### Project shell additions

`OrchestrationProject` and `OrchestrationProjectShell` gain:

```ts
workspaceLayoutVersion: ProjectWorkspaceLayoutVersion; // decoding default 0
workspaceLayout: ReadonlyArray<ProjectWorkspaceEntry>; // decoding default []
```

Both decode with defaults, so old project events and old projection rows remain readable, a new
client against an old server degrades to the flat thread list, and native mobile decodes the shell
without needing to understand layout.

## Mutation

One project-aggregate command, `project.workspace-layout.apply`, carrying `expectedVersion` and one
operation:

| Operation        | Effect                                                           |
| ---------------- | ---------------------------------------------------------------- |
| `attach-path`    | Adds a file or folder reference.                                 |
| `add-url`        | Adds a durable URL shortcut.                                     |
| `place-resource` | Materializes a synthetic thread or command entry at a placement. |
| `move`           | Reparents and re-ranks an existing entry.                        |
| `rename`         | Sets an entry label.                                             |
| `remove`         | Removes placement.                                               |

It emits `project.workspace-layout-applied` with the project id, the normalized operation, the new
layout version, and `updatedAt`.

### Server invariants

- The project exists and is active, and `expectedVersion` equals the current version.
- Entry and parent belong to the same physical project; parent exists unless `null`.
- An item cannot be its own parent, and the new parent cannot be a descendant of the item.
- Commands and URLs cannot be parents. Live terminal and browser ids are rejected outright — they
  are not persistent entries.
- Paths are normalized, relative to `workspaceRoot`, and cannot escape it. Duplicate scoped path
  attachment is rejected and the existing node is focused instead.
- The decider does not require an attached path to still exist. A path that disappears becomes a
  visible broken reference rather than a silent deletion.
- Referenced threads must exist, not be deleted, and belong to the project. Referenced scripts must
  exist.
- `beforeId`, when present, must share the resulting parent.
- Removing a file/folder/URL reparents its persistent children to the removed node's parent,
  preserving order.
- Removing a thread or command entry resets it to synthetic root placement. It does not delete the
  thread or the script.

### Rejections

Failures are reported as a `ProjectWorkspaceLayoutRejection` with one of these tags:

`version-conflict` · `cycle` · `missing-target` · `duplicate-path` · `cross-project` ·
`invalid-parent` · `invalid-path` · `not-persistent`

`version-conflict` includes `currentVersion` so the client can resync and offer retry instead of
guessing. A conflict never overwrites a newer layout.

## Synthetic and live nodes

The client view model adds nodes that are never persisted:

- an unplaced unarchived thread renders as a synthetic root thread — every unarchived thread appears
  exactly once, and the root is the fallback so no thread can be hidden;
- a script with no explicit placement renders as a synthetic root command;
- a live terminal renders as `terminal:<environmentId>:<threadId>:<terminalId>`;
- a live browser tab renders as `browser:<environmentId>:<threadId>:<tabId>`.

Moving a synthetic thread or command materializes its persistent entry through `place-resource`.

Persisted item ids are project-local, so the web view model qualifies every rendered key with
environment and project (`node:<environmentId>:<projectId>:<itemId>`) before combining physical
members into one logical project display. Moves across physical members are rejected.

Archived threads do not render, keep their placement so unarchive restores it, and cannot receive a
drop. Deleted threads and scripts are pruned server-side and ignored defensively by the client
builder.

## Scoping

Layout is per physical project. A grouped logical project made of several physical
projects/environments keeps one layout per member. Cross-project and cross-environment moves are
rejected. The sidebar presents grouped members as a single-open workspace accordion: the active
thread's physical member opens automatically, and selecting another member swaps in that member's
independently indexed and persisted tree.
