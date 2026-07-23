---
name: marcode-skill-upkeep
description: Keep .agents/skills/** accurate as upstream T3 Code changes and as Marcode adds its own features. Use before trusting a skill's ports/paths/commands/versions, after an upstream-sync pull request touches a hotspot path, when a skill's claims look stale, or when deciding whether a new feature needs its own sibling skill versus an edit to an existing one.
---

# Marcode Skill Upkeep

Marcode forks T3 Code and keeps adding to it. `.agents/skills/**` has two kinds of skill as a result:
skills that document **upstream T3 behavior** (`test-t3-app`, `test-t3-mobile`, `ios-debugger-agent`,
`ios-simulator-browser`), and skills that document **Marcode-only additions**
(`unified-workspace-sidebar`, and whatever gets added after it). Upstream moves on its own schedule;
nothing regenerates a skill when it does. This skill is how you notice and fix that without wrecking
the next merge. It complements [`docs/operations/upstream-sync.md`](../../../docs/operations/upstream-sync.md)
and `scripts/upstream-sync*.ts` — those detect and merge upstream _code_; this is about re-verifying
_skills_ afterward. Don't duplicate the merge-conflict-resolution workflow described there; link to it.

All four T3-derived skills and both Marcode-only skills were re-verified line-by-line against the live
repo at commit `50471316` (2026-07-22) while writing this skill. Treat that as the last known-good
checkpoint, not a permanent guarantee — check what changed since, not everything from scratch.

## Two kinds of claim, one owner each

Every fact a skill asserts falls into one of two buckets. Know which bucket before you edit anything.

- **Upstream-owned**: behavior T3 Code itself defines — dev-server port defaults
  (`scripts/dev-runner.ts`'s `BASE_SERVER_PORT`/`BASE_WEB_PORT`), the mobile dev-client identity
  (`apps/mobile/app.config.ts`'s `appName`/`scheme`/bundle ids — still literally `"T3 Code Dev"` /
  `t3code-dev` / `com.t3tools.t3code.dev`, because renaming bundle identifiers or the `@t3tools/*`
  package namespace would create a permanent merge conflict with every upstream file for no product
  benefit), pinned tool versions (`xcodebuildmcp@2.6.2` in `.mcp.json`/`.codex/config.toml`,
  `serve-sim@0.1.45` in the ad-hoc `npx` command), CLI command names (`vp run dev`,
  `auth pairing create`). **Do not "fix" these to say Marcode** — `README.md` still says "T3 Code"
  and the root package is still named `@t3tools/monorepo` on purpose. That is not drift; renaming it
  would be.
- **Fork-owned**: behavior that exists only because Marcode added it — the unified workspace tree,
  the `unifiedWorkspaceSidebar` flag, anything under `docs/specs/`, `docs/user/`, and the fork's own
  product surfaces (`apps/web/src/branding.ts`, `MarcodeMark.tsx`, the visible product name
  "Marcode" — capital M, rest lowercase — used throughout the actual UI). These have no upstream
  counterpart to preserve, so update them freely as the feature evolves.

A skill can mix both (`test-t3-mobile` describes upstream mobile testing but the repo it's testing is
this fork's checkout). When editing, touch only the fork-owned claim; leave the upstream-owned
claim's wording alone even if you'd phrase it differently.

## Signals a skill has drifted

Concrete, checkable triggers — not vibes:

- A hotspot path in `.github/upstream-sync.yml`'s `hotspots[]` (e.g. `apps/web/src/components/Sidebar.tsx`,
  `apps/web/src/index.css`, `apps/server/src/provider/**`) was touched by a recent
  `chore/upstream-<sha>` merge. Any skill documenting that path needs a look — that's exactly why the
  manifest calls those paths out as mandatory-review, not just for code.
- A skill names an exact version (`xcodebuildmcp@2.6.2`, `serve-sim@0.1.45`) and the pinned config no
  longer matches.
- A skill names an exact port, path, command, bundle id, or scheme, and it no longer matches the live
  source that defines it.
- A skill references a file that no longer exists, or a command (`vp run <x>`) that isn't in any
  `package.json` `scripts` block anymore.
- A skill describes a rollout flag, feature, or in-progress subsystem as fact, and the schema/plumbing
  it depends on has since changed shape (see `unified-workspace-sidebar`'s "Known gaps" section for
  what this looks like while a feature is still landing — expect entries there to go stale fastest).

## Re-verifying a skill against the live repo

The checklist actually used to verify all six skills currently in this repo:

1. **Extract every concrete claim** from the skill: file paths, command names, port numbers, version
   pins, identifiers (bundle id, scheme, app name), and behavioral assertions ("X decodes with default
   Y", "Z is rejected server-side").
2. **Check each claim against a live source**, not against another doc or your own memory of the
   feature:
   - Paths/files → `find`/`ls`/`Read` the actual file.
   - Commands → confirm they exist in the relevant `package.json` `scripts`, or are real binaries
     (`ls node_modules/.bin/`, `pnpm exec <cmd> --version`).
   - Ports/constants → grep the source file that defines them (e.g. `scripts/dev-runner.ts`), not the
     skill that quotes them.
   - Version pins → grep `.mcp.json`, `.codex/config.toml`, or the relevant `package.json`.
   - Schema/behavior claims → read the actual schema/decider/projector, not just the spec doc — specs
     describe intent, code is what runs. If a doc and the code disagree, code wins; note the doc as
     stale.
3. **Check `git log` for the referenced files** since the skill was last edited
   (`git log --oneline -- <path>`), to catch a rename/refactor that moved behavior without moving the
   skill's wording.
4. **Fix only the failed claim.** Keep the skill's existing structure, section order, and voice. Don't
   rewrite a whole section because you're already in the file — that's how upstream-derived skills
   pick up merge conflicts on the next sync for no reason (see the next section).
5. **If it's an upstream-derived skill and the fix is more than a wrong local fact** (i.e. you'd be
   changing what it says T3 itself does), stop — that's a signal upstream actually changed, which
   belongs in the `upstream:plan`/sync review flow, not a silent skill edit.

## After an upstream-sync PR lands

`docs/operations/upstream-sync.md` already tells you how to resolve the merge itself and how to
combine upstream's intent with Marcode's per hotspot path. It does not tell you which _skills_ to
re-check afterward — that's this section.

Once a `chore/upstream-<sha>` merge lands on `main`:

1. Diff the merge commit's changed paths against every hotspot in `.github/upstream-sync.yml` and
   against every path an existing skill names (grep the skill files for the changed paths — cheap and
   exhaustive).
2. For each match, run the re-verification checklist above on the matching skill(s), scoped to just
   the claims that touch the changed path.
3. If upstream changed behavior a skill documents as fact (not just moved a file), treat it the same
   as any other hotspot conflict: read what upstream intended, decide what Marcode's skill should now
   say, and write the combined result — don't silently keep the pre-merge wording just because it's
   less work.
4. Fix forward with a normal commit; this is documentation maintenance, not a merge conflict, so it
   doesn't need the sync tooling's branch/PR ceremony.

## Adding a new Marcode-only skill

Checklist, followed while writing `unified-workspace-sidebar` and this skill:

- Verify every path/command/port/identifier against the live repo before writing it down — never
  copy a claim from a spec doc, another skill, or a code comment without checking it against the
  actual file. Specs describe intent at write time; say so plainly if something can't be verified
  (an in-progress feature can have gaps that are true today and false next week — name them as
  "known gaps at baseline `<short-sha>`," not as permanent fact).
- Match the existing frontmatter exactly: only `name` (kebab-case, equal to the directory name) and
  `description` (one paragraph, states what the skill does and when to use it). No other frontmatter
  fields — malformed frontmatter is a skill that silently fails to load, and nothing here confirms
  which extra fields are tolerated.
- Add the matching `agents/openai.yaml` (`interface.display_name`/`short_description`/`default_prompt`)
  — every skill in this repo has one, Marcode-authored or not; it's how Codex-side agents see the same
  skill.
- Only add a `LICENSE` file if the skill is actually adapted from a third-party source under its own
  license (see `ios-debugger-agent`/`ios-simulator-browser`, both MIT-adapted from OpenAI's
  `build-ios-apps` plugin). A Marcode-original skill doesn't get one.
- Prefer a `references/<topic>.md` subfolder for material a reader only needs occasionally (see
  `test-t3-app/references/sqlite-fixtures.md`) over inlining everything — keeps the main `SKILL.md`
  focused on "what do I do," not "everything about this system."
- Decide sibling vs. edit-in-place by asking: does this document T3 upstream behavior, or a Marcode
  addition? Never rewrite an upstream-derived skill's structure/behavior claims to fold in a Marcode
  addition — add a sibling skill instead (this is why `unified-workspace-sidebar` exists next to
  `test-t3-app` rather than being stuffed inside it). Only edit an upstream-derived skill in place for
  a verified factual correction local to this repo (a wrong port, a wrong path) — never for new
  Marcode behavior.
- Name it after the feature/subject, not after "Marcode," when the subject itself is unambiguous
  (`unified-workspace-sidebar`, not `marcode-unified-workspace-sidebar`) — mirrors how
  `ios-debugger-agent` isn't named `marcode-ios-debugger-agent`. Reach for a `marcode-` prefix only
  when the name would otherwise be ambiguous about which product/fork it's scoped to (this skill is
  about Marcode's own skill set specifically, not skills in general, so it keeps the prefix).
