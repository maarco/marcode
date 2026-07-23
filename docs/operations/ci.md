# CI quality gates

- `.github/workflows/ci.yml` runs `vp check` (lint + typecheck), `vpr typecheck`, and `vp run test` on pull requests and pushes to `main`.
- `.github/workflows/release.yml` builds macOS (`arm64` and `x64`), Linux (`x64`), and Windows (`x64`) desktop artifacts from a single `v*.*.*` tag and publishes one GitHub release.
- The release workflow auto-enables signing only when platform credentials are present. macOS passkey builds additionally require `APPLE_TEAM_ID` and the `MACOS_PROVISIONING_PROFILE` secret; Windows uses Azure Trusted Signing. Without the core signing credentials, it still releases unsigned artifacts.
- `.github/workflows/upstream-sync.yml` is detection and integration preparation, not a quality gate. On a schedule (and on demand) it plans a merge from the official `pingdotgg/t3code` repository and, only when the merge is clean, pushes a `chore/upstream-*` branch and opens a **draft** pull request. It never pushes to `main`, never force pushes, and never resolves conflicts; the pull-request jobs above are what actually prove the merged result. See [Upstream sync](./upstream-sync.md).
- See [Release Checklist](./release.md) for the full release/signing setup checklist.
