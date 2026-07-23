# Upstream sync test fixtures

This directory is intentionally almost empty.

The upstream-sync tests need real Git repositories (bare remotes, working clones, conflicting
histories). Those are **created dynamically in temporary directories** by the tests themselves and
removed when the test scope closes.

Rules:

- Do not commit nested `.git` directories, packed objects, or generated repository state here. A
  nested repository inside the worktree breaks `git status`, `vp fmt`, and the sync tooling's own
  clean-worktree check.
- Do not commit captured plan reports; they contain SHAs that go stale immediately and the tests
  assert against freshly generated ones.
- Manifest fixtures are inline strings in `scripts/lib/upstream-sync-config.test.ts` so a malformed
  fixture fails at the assertion instead of at repository load.

If a fixture genuinely cannot be built at runtime, add it here as plain text plus a note in this
file explaining why it cannot be generated.
