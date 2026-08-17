# AGENTS.md

Marcode is a maintained fork of `pingdotgg/t3code`. Treat runtime behavior, source artifacts, and
the checked-in fork policy as authoritative. Preserve Marcode's intentional product behavior while
bringing in upstream correctness, security, protocol, dependency, and operational fixes.

## Task Completion Requirements

- Keep local verification focused on the files and packages changed. Run the smallest relevant test set; do not run the full workspace test suite as a routine completion step.
  - Use `vp test run <test-files>` for focused built-in Vite+ tests. Use `vp run test` only when the affected package specifically requires its `test` script.
  - Backend changes must include and run focused tests for the changed behavior.
  - Run targeted formatting, lint, and type checks for the affected scope when available.
- Do not run repo-wide `vp check`, `vp run typecheck`, `vp run test`, or equivalent full-suite commands locally unless the user explicitly requests them. CI is responsible for the full verification suite.
- After frontend feature development or any user-visible frontend behavior change, the primary agent must run one integrated verification pass for each affected client surface after integrating the work:
  - Web: use the `test-t3-app` skill. Launch one isolated environment, authenticate through the printed pairing URL, and verify the affected flow in the controlled browser.
  - Mobile: use the `test-t3-mobile` skill. Connect one representative iOS Simulator or Android Emulator available on the host to one isolated environment. On compatible macOS hosts, prefer iOS for cross-platform changes.
  - Subagents must not independently launch dev servers or repeat integrated client verification unless their delegated task explicitly requires it.
  - Stop dev servers, watchers, and other long-running verification processes when focused verification is complete.

## Dev Servers

- In a linked git worktree, dev state defaults to that worktree's gitignored `.marcode`. This deliberately outranks an ambient `MARCODE_HOME`, which could otherwise select the installed app's live `~/.marcode/userdata` database. An explicit `--home-dir` still wins.
- Start the web stack with `vp run dev`. Add `--share` when someone needs to open it from another device on the tailnet.
- Browser dev is single-origin: Vite proxies `/api`, `/ws`, `/oauth`, and `/.well-known` to the backend. Do not set `VITE_HTTP_URL` or `VITE_WS_URL` for `dev`/`dev:web`.
- Worktree paths supply stable preferred port offsets. Read the actual server and web ports from the `[dev-runner]` line because occupied ports can still shift them.
- Before handing off a `--share` URL, open its origin in a controlled browser and confirm the app loads. A successful curl is insufficient because browsers reject some otherwise reachable ports.
- If a pairing token got consumed, mint a fresh one with `node apps/server/src/bin.ts pair` — note it carries standard scopes, while the startup URL carries admin scopes (needed for Settings → Connections management).

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps provider CLIs, serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `apps/desktop`: Electron shell around the web client and desktop/server integration.
- `apps/mobile`: React Native client for iOS and Android remote control.
- `packages/contracts`: Shared Effect/Schema schemas and TypeScript contracts. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by server and client applications. Uses explicit subpath exports — no barrel index.
- `packages/client-runtime`: Shared runtime package for client code used by web and mobile.

## Multi-surface and Safety Rules

- A behavior may have web, desktop, mobile, command-palette, settings, keybinding, local, remote, and relay entry points. Sweep the applicable siblings before claiming completion.
- Provider-shaped changes require a decision for Codex, Claude, Cursor, Grok, and OpenCode, even when a provider is intentionally unsupported.
- Anything crossing the wire belongs in `packages/contracts`; update the server and every affected client together.
- Never kill processes by broad name/path matching. Kill only a PID captured at spawn, or a confirmed owner of the exact port and worktree.
- Never start a server against or write to the installed user's live `~/.marcode/userdata` database. Use the worktree's isolated `.marcode` state.
- Do not set `VITE_HTTP_URL` or `VITE_WS_URL` for dev; Vite's single-origin proxy is required for local and remote browser behavior.
- The server is event-sourced. Tests wait for typed receipts and worker drains; do not make them pass with arbitrary sleeps or polling.

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Vendored Repositories

This project vendors external repositories under `.repos/` as read-only reference material.

- Prefer examples and patterns from vendored source over generated guesses or web search results.
- Do not edit files under `.repos/` unless explicitly asked.
- Do not import from `.repos/`; application code must continue importing from normal package dependencies.
- Manage vendored subtrees with `vpr sync:repos`; use `vpr sync:repos --repo <id>` to sync one configured repository.
- When updating a dependency with a configured vendored subtree, sync that subtree in the same change so `.repos/` matches the installed dependency version.
- When writing Effect code, read `.repos/effect-smol/LLMS.md` first and inspect `.repos/effect-smol/` for idiomatic usage, tests, module structure, and API design.
- When writing relay infrastructure code with Alchemy, inspect `.repos/alchemy-effect/` for idiomatic usage, tests, module structure, and API design.

## Upstream Sync

This repository is a fork of `pingdotgg/t3code`. Merging upstream goes through the checked-in policy in `.github/upstream-sync.yml` and the `upstream:status` / `upstream:plan` / `upstream:integrate` commands — never ad-hoc git.

- Use `vp run upstream:plan` to inspect an upstream delta. It is read-only and does not touch the checkout.
- Never force push, `git reset`, `git restore .`, `git checkout --ours/--theirs`, `git stash`, `git clean`, or delete a branch to resolve an upstream conflict. Resolve conflicts by hand on a new integration branch and open a review pull request.
- Hotspot paths in the manifest are mandatory-review paths, not automatic keep-Marcode paths. An upstream security or correctness fix must not be dropped because it touched a customized file.
- Keep compatibility identifiers such as `@t3tools/*`, storage keys, mobile schemes, bundle identifiers, and protocol names unless a deliberate migration changes them.
- Use Marcode for visible product identity; do not mass-replace internal upstream-shaped `T3` identifiers.
- See [Upstream sync](./docs/operations/upstream-sync.md) for the runbook.

### How the scheduled sync behaves

`.github/workflows/upstream-sync.yml` runs daily. A clean delta pushes `chore/upstream-<short-sha>`
and opens a draft pull request. A conflicted delta pushes nothing, files an `upstream-sync-blocked`
issue, and fails the run on purpose — that failure is the signal, not a broken workflow. Resolve it
by hand on an `integrate/upstream-<short-sha>` branch, open a review pull request, and close the
tracking issue when the resolution lands.

Local `upstream:status` and `upstream:plan` are read-only and safe to run any time.

### Write every change so the next upstream merge is cheap

This is a maintained fork: upstream rewrites their files, and every line Marcode edits inside an
upstream-owned file is a line some future sync has to reconcile by hand. Treat the size of that
edit surface as a cost you are choosing to pay. Before opening any pull request, ask what the next
merge will look like — and prefer the shape that conflicts on a seam instead of a subsystem.

- **Add a file, don't rewrite theirs.** Put Marcode behavior in a Marcode-owned module and mount it
  from the upstream file in as few lines as possible. `apps/web/src/components/unified-workspace/`
  is the worked example: the whole workspace tree lives there and `Sidebar.tsx` carries one import
  plus one mount point, so upstream replacing their entire sidebar cost a two-hunk conflict instead
  of thousands of lines.
- **Minimize coupling, not just line count.** A Marcode component that accepts fifteen handlers
  threaded out of an upstream component's local variables breaks on every upstream refactor. One
  that takes a few stable identifiers and sources the rest from hooks and stores survives them.
  Coupling to their internals is the expensive part; a long file of your own is not.
- **Mark the seam.** Comment the insertion point in the upstream file (`── Marcode fork seam ──`)
  and say what it mounts and why. The next person resolving that conflict needs to know instantly
  whether a hunk is theirs, ours, or a join.
- **Take their refactor even when you keep your behavior.** When upstream renames a selector,
  splits a helper into a new module, or moves a token, follow them and re-apply Marcode's behavior
  on top. Keeping the old shape "because ours works" guarantees the same conflict next time, and
  quietly opts out of everything they build on the new shape.
- **Pin removals with a test.** Marcode retiring an upstream surface (right-panel file surfaces,
  the sidebar footer) is invisible to a merge — upstream keeps shipping it and it merges back in
  silently. Assert the removal so a future sync fails loudly instead.
- **Watch for the breaks that produce no conflict.** A clean merge is not a safe merge. New
  upstream code that reads `T3CODE_*` env vars, `t3code:*` storage keys, `~/.t3` paths, or
  `t3code.service` will merge without a mark and then quietly not work on Marcode. After any sync,
  grep the merged tree for upstream identity that Marcode renames and confirm each hit.
- **Divergences you keep, you own.** Holding a different implementation of an upstream subsystem
  (the xterm terminal, kept for its search) means re-porting their work on that subsystem by hand,
  every sync, forever. That can be the right call — make it deliberately, and say so in a comment
  where the divergence lives.

## Terminology

- **you** means the agent reading this file and changing Marcode.
- **user** means the person using Marcode to direct coding agents.
- **agent** means the coding agent a user runs inside Marcode. Depending on context, that may also include you.
- **provider** means the agent runtime or harness Marcode talks to, such as Codex, Claude, Cursor, or OpenCode.
- **client** means the web, desktop, or mobile UI.
- **environment** means one running server and the machine, filesystem, provider credentials, and state it owns.
- **project** means an environment-local workspace record rooted at a directory.
- **thread** means the durable conversation and work history for a project.
- **turn** means one user-to-agent cycle, including follow-up work such as checkpointing.
- **Marcode home** means the base data directory. Runtime state normally lives below its `userdata` directory.

## The three ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or `kill` a PID you found by matching a name, path, or worktree string. Your own agent process has this worktree's path in its argv, and this machine runs several other dev servers at once. Kill only a PID you captured at spawn, or the owner of your port after confirming its working directory is your worktree.
2. **Writing to the live install.** `~/.marcode/userdata` is the developer's real Marcode database, in use while you work. Reading it and copying from it are fine, and a good way to get real test data (see Test data). Never start a server against it, never open it read-write, never clean it up.
3. **Baking in origins.** Never set `VITE_HTTP_URL` or `VITE_WS_URL` for dev. Dev is single-origin and Vite proxies `/api`, `/ws`, `/oauth`, and `/.well-known`. Setting them bakes localhost into the bundle and silently breaks every remote browser.

## Test data

An empty database is a bad test. Seed your worktree's `.marcode` with a copy of real data instead of pointing at live state:

- Copy from `~/.marcode/userdata` (the developer's real data, the most realistic test set) or `~/.marcode/dev`. Worktree state lives at `<worktree>/.marcode/userdata`.
- Snapshot the database with `VACUUM INTO`, which is safe even while a server has the source open and yields one consistent file:

  ```bash
  mkdir -p .marcode/userdata
  rm -f .marcode/userdata/state.sqlite*  # VACUUM INTO refuses to overwrite
  bun -e "new (require('bun:sqlite').Database)(process.env.HOME + '/.marcode/userdata/state.sqlite', { readonly: true }).run(\"VACUUM INTO '.marcode/userdata/state.sqlite'\")"
  ```

  A plain `cp` is only safe when no server has the source open, and must bring the `-wal` and `-shm` siblings along. A live file copy is a corrupt copy.

- Bring `secrets` and `settings.json` only if the flow under test needs them.
- Copy in, never symlink. Data flows one way: into your sandbox, never back out.

## How it works

Clients send typed WebSocket requests. The server turns them into _commands_, a pure _decider_ turns commands into persisted _events_, and a _projector_ derives the read model the UI renders. Provider CLIs run as subprocesses; per-provider _adapters_ translate their native protocols into orchestration events. Side effects run in queue-backed _reactors_ that emit _receipts_ when milestones land. Each turn ends with a _checkpoint_, a hidden git ref, so the app can diff and restore.

Full glossary with file links: `docs/internals/glossary.md`

## Pull requests

- Never open a pull request unless the developer explicitly asks you to.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it.
- One concern per PR. If the description says "also", split it.
- UI changes need before/after images. Motion or timing needs a short video.
- When babysitting a pull request: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## Taste

- Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves.
- Our users drive agents all day and notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations; they peg the GPU on high-refresh displays.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.
