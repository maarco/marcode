# Marcode

Marcode is a maintained fork of [T3 Code](https://github.com/pingdotgg/t3code), a minimal web GUI for coding agents. It currently supports Codex, Claude, Cursor, and OpenCode.

## Installation

Authenticate at least one provider before use:

- Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
- Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
- Cursor: install [Cursor CLI](https://cursor.com/cli) and run `cursor-agent login`
- OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Run without installing

The CLI keeps the upstream-compatible `t3` package name:

```bash
npx t3@latest
```

Use `npx t3@latest --help` for the full CLI reference.

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

- [Getting started](./docs/getting-started/quick-start.md)
- [Remote access](./docs/user/remote-access.md)
- [Server updates](./docs/user/server-updates.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Provider guides](./docs/providers/codex.md)
- [Operations](./docs/operations/ci.md)
- [Reference](./docs/reference/encyclopedia.md)

## Upstream synchronization

Marcode tracks the official [T3 Code repository](https://github.com/pingdotgg/t3code) as `upstream`.

The scheduled [Upstream Sync workflow](https://github.com/maarco/marcode/actions/workflows/upstream-sync.yml) detects upstream changes and prepares reviewable integration work. It never resolves conflicts automatically or pushes to `main`. Conflicted syncs create a GitHub Issue for manual follow-up; clean syncs create a draft pull request.

See the [upstream sync runbook](./docs/operations/upstream-sync.md) for the integration policy and recovery steps.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request. The repository's [Issues](https://github.com/maarco/marcode/issues) are enabled for bug reports and follow-up work.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
