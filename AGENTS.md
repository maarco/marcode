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

### Pending: first live workflow run

`.github/workflows/upstream-sync.yml` has never executed. It becomes real once it is on the default branch on GitHub. When Marco is ready to push `main`:

1. Push `main` to `origin`.
2. Enable _Settings → Actions → General → Allow GitHub Actions to create and approve pull requests_.
3. Trigger the workflow manually via `workflow_dispatch` and watch the run.
4. Expect a draft PR from `chore/upstream-<short-sha>` into `main`. Review it; nothing auto-merges.

Local `upstream:status` and `upstream:plan` are read-only and safe to run any time.
