# Marcode

Marcode is a maintained fork of [T3 Code](https://github.com/pingdotgg/t3code), an agent harness control surface for controlling coding agents from the web, mobile, and desktop.

Works with your subscriptions on Claude Code, Codex, Cursor, Grok Build, and OpenCode. If they're set up on your computer, Marcode can control them.

## Installation

> [!WARNING]
> Marcode currently supports Codex, Claude, Cursor, Grok Build and OpenCode. Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Try it out (install-free)

The easiest way to test Marcode is to run the server in your terminal (requires Node.js 22.16+, 23.11+, or 24.10+).

The CLI keeps the upstream-compatible `t3` package name:

```bash
npx t3@latest
```

This launches the backend and local web app to control your agents.

Tip: Use `npx t3@latest --help` for the full CLI reference.

### Run from source

Install [Vite+](https://vite.plus/guide/) and the project dependencies:

```bash
vp i
vp run dev
```

For the desktop development surface:

```bash
vp run dev:desktop
```

Published desktop builds will appear in [Marcode Releases](https://github.com/maarco/marcode/releases).

## Status

Marcode is early and under active development. Expect bugs and incomplete surfaces.

## Documentation

Full docs live in [docs/](./docs). There's no docs site yet.

- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- [Unified workspace sidebar](./docs/user/unified-workspace-sidebar.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- Linux: [run Marcode as a background service](./docs/user/background-service.md)

Building from source? Start at [docs/internals/overview.md](./docs/internals/overview.md).

## Upstream synchronization

Marcode tracks the official [T3 Code repository](https://github.com/pingdotgg/t3code) as `upstream`.

The scheduled [Upstream Sync workflow](https://github.com/maarco/marcode/actions/workflows/upstream-sync.yml) detects upstream changes and prepares reviewable integration work. It never resolves conflicts automatically or pushes to `main`. Conflicted syncs create a GitHub Issue for manual follow-up; clean syncs create a draft pull request.

See the [upstream sync runbook](./docs/operations/upstream-sync.md) for the integration policy and recovery steps.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request. The repository's [Issues](https://github.com/maarco/marcode/issues) are enabled for bug reports and follow-up work.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
