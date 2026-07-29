# Unified workspace sidebar

The left sidebar organizes each project as a single tree: threads, the files and folders you care
about, live terminals, live browser tabs, URL shortcuts, and project commands, all in one place.

The tree is for navigation and organization. The right panel is still where things open — clicking a
row activates the surface you already know.

## Default behavior

The unified sidebar is on by default. Set `unifiedWorkspaceSidebar` to `false` if you need the
familiar flat thread list while migrating or troubleshooting. If your server is older than your
client, the tree renders read-only: you can browse and open, but attaching and moving are disabled
with a message explaining the server needs an upgrade.

## What lives in the tree

```text
Project Alpha
├─ src/                                  attached folder
│  ├─ auth.ts                            attached file
│  │  └─ Fix token refresh               thread
│  │     ├─ pnpm test auth               terminal, live
│  │     └─ localhost:5173               browser tab, live
│  └─ Redesign authentication            thread
├─ Product brief.md                      attached file
│  └─ Turn brief into milestones         thread
├─ Run web                               project command
├─ Local app                             URL shortcut
└─ General investigation                 thread at project root
```

A file can hold threads underneath it. That is an organizational relationship, not a claim that the
file is a folder on disk — it is how you say "this work belongs to this file." Threads can nest under
other threads too.

Every thread you have not archived is always somewhere in the tree. If you never placed one, it sits
at the project root. Nothing gets hidden.

When several checkouts or worktrees are grouped under one repository row, each physical project
keeps its own tree. The grouped row lists those workspaces as a compact accordion and opens the
workspace that owns the active thread automatically. Select another workspace row to inspect its
folders, threads, commands, and live resources without mixing identical paths from different
worktrees.

## Adding things

Use **Add item** on the project row, or the context menu on any row to add underneath it:

- **New thread** — also still available with its keyboard shortcut.
- **Attach file** / **Attach folder** — pick from the project's indexed paths.
- **Add URL shortcut** — a label and a URL you want to keep.
- **Add command** — opens the usual project command editor.

Attaching a folder does not expand everything inside it. It is a shortcut you hang work on; the file
explorer is still where you browse the full filesystem.

If you attach a path that is already in the tree, the existing row is focused instead of creating a
duplicate.

## Moving things

Drag a row with the mouse or by touch, or use **Move to…** from its context menu. The keyboard works
too: arrows to move around, `Enter` to open, `F2` to rename, `Shift+F10` for the row menu. Any of
these can complete the same move — the dialog is not a lesser path.

While dragging, you will see either a line showing where the row will land or a highlight on the
container it will drop into. Collapsed containers open after you hover them for a moment.

Some moves are refused on purpose: dropping a row into its own descendant, moving between different
projects or environments, and dropping onto a command, URL, terminal, or browser tab.

## Live terminals and browser tabs

Terminals and browser tabs appear automatically under the thread that owns them, and disappear when
you close them. They are never something you place or manage from the tree — the tree is showing you
what is actually running.

To keep a browser tab around after closing it, use **Pin shortcut** on the tab. That turns it into a
durable URL shortcut.

## Missing files

If a file or folder you attached is renamed or deleted on disk, the row stays and is marked with a
warning icon and a "Path not found" tooltip. It is not removed for you, so you can see what broke and
decide what to do.

## Removing things

**Remove from sidebar** takes a row out of the tree. That is all it does.

It never deletes the file on disk, never deletes the thread, never closes the terminal or browser
tab, and never deletes the project command. Deleting a thread or a command is a separate, clearly
labeled destructive action with its own confirmation.

Removing a file or folder that has rows underneath it keeps those rows — they move up to where the
removed row used to be.

## What did not change

Project grouping, manual project ordering, thread rename, archive, delete, mark unread, PR links,
worktree actions, status indicators, discovered ports, the right-panel tabs, the file explorer, and
project command editing and running all behave as they did before.
